import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, FlatList, ScrollView, TouchableOpacity,
  ActivityIndicator, StyleSheet, Share, Platform, KeyboardAvoidingView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useFonts, Amiri_400Regular } from '@expo-google-fonts/amiri';

// app config and server setup
const expoHost = Constants.expoConfig?.hostUri?.split(':')[0];
const SERVER = process.env.EXPO_PUBLIC_SERVER_URL || `http://${expoHost || 'localhost'}:3000`;
const QURAN = 'https://api.alquran.cloud/v1';

// dark Quran palette with gold accents
const C = {
  bg: '#0F1B3D', surface: '#162550', raised: '#1D3066', line: '#2B3F7A',
  text: '#F3ECDA', muted: '#9FABCB', gold: '#D8B45E', goldDim: '#3A3A4A', danger: '#E08B7A',
};
const ARABIC = 'Amiri_400Regular';

// local storage helpers
const store = {
  async get(k, d) { try { const v = await AsyncStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  async set(k, v) { try { await AsyncStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

/* ------------------------------- Quran data -------------------------------- */
const plain = (t) => t.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '');
const stripBismillah = (t, s, a) => {
  if (a !== 1 || s === 1 || s === 9) return t;
  const w = t.split(' ');
  return w.length > 4 && plain(w[0]) === 'بسم' ? w.slice(4).join(' ') : t;
};

async function fetchSurahs() {
  const cached = await store.get('surahs', null);
  if (cached) return cached;
  const r = await fetch(`${QURAN}/surah`);
  const j = await r.json();
  await store.set('surahs', j.data);
  return j.data;
}

async function fetchSurah(n) {
  const cached = await store.get(`surah:${n}`, null);
  if (cached) return cached;
  const r = await fetch(`${QURAN}/surah/${n}/editions/quran-uthmani,en.sahih`);
  const j = await r.json();
  const ar = j.data.find((d) => d.edition.identifier === 'quran-uthmani').ayahs;
  const en = j.data.find((d) => d.edition.identifier === 'en.sahih').ayahs;
  const ayahs = ar.map((a, i) => ({
    ayah: a.numberInSurah,
    arabic: stripBismillah(a.text, n, a.numberInSurah),
    english: en[i].text,
  }));
  await store.set(`surah:${n}`, ayahs);
  return ayahs;
}

async function callServer(path, body) {
  let r;
  try {
    r = await fetch(SERVER + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
  } catch {
    throw new Error(`Cannot reach the AI server at ${SERVER}. Is "npm start" running, and is your phone on the same Wi-Fi?`);
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Server error (${r.status})`);
  return j;
}

/* ------------------------------ shared pieces ------------------------------ */
function VerseCard({ v, reason, saved, onToggle, onOpen, highlight }) {
  return (
    <View style={[s.card, highlight && { borderColor: C.gold }]}>
      <View style={s.cardTop}>
        <TouchableOpacity onPress={onOpen} disabled={!onOpen} hitSlop={8}>
          <Text style={s.ref}>{v.surahName}  {v.ref}</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', gap: 18 }}>
          <TouchableOpacity hitSlop={8} onPress={() => Share.share({ message: `${v.arabic}\n\n${v.english}\n\n(Quran ${v.ref})` })}>
            <Text style={s.icon}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity hitSlop={8} onPress={onToggle}>
            <Text style={[s.icon, saved && { color: C.gold }]}>{saved ? 'Saved' : 'Save'}</Text>
          </TouchableOpacity>
        </View>
      </View>
      <Text style={s.arabic}>{v.arabic}</Text>
      <Text style={s.english}>{v.english}</Text>
      {reason ? (
        <View style={s.reason}>
          <Text style={s.reasonText}>{reason}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Chip({ label, active, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={[s.chip, active && s.chipOn]}>
      <Text style={[s.chipText, active && { color: C.bg }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Notice({ children, error }) {
  return (
    <View style={[s.notice, error && { borderColor: C.danger }]}>
      <Text style={[s.noticeText, error && { color: C.danger }]}>{children}</Text>
    </View>
  );
}

const DISCLAIMER =
  'Verses come straight from the Quran database. The AI picks them and explains why, and can be wrong. For rulings, ask a qualified scholar.';

function AIResult({ data, isSaved, onToggle, onOpen, onFollowUp, onOpenSurah }) {
  return (
    <View>
      <View style={s.aiBox}>
        <Text style={s.aiLabel}>Noor</Text>
        <Text style={s.aiMsg}>{data.message}</Text>
      </View>
      {data.verses.map((v) => (
        <VerseCard key={v.ref} v={v} reason={v.reason} saved={isSaved(v.ref)} onToggle={() => onToggle(v)} onOpen={() => onOpen(v)} />
      ))}
      {data.verses.length === 0 && <Notice>No matching verses found. Try different words.</Notice>}
      {data.next_surah ? (
        <TouchableOpacity style={s.nextCard} onPress={() => onOpenSurah(data.next_surah.number)}>
          <Text style={s.nextTitle}>Read next: Surah {data.next_surah.number}</Text>
          <Text style={s.nextBody}>{data.next_surah.reason}</Text>
        </TouchableOpacity>
      ) : null}
      {data.follow_ups?.length ? (
        <View style={s.chipWrap}>
          {data.follow_ups.map((f) => <Chip key={f} label={f} onPress={() => onFollowUp(f)} />)}
        </View>
      ) : null}
      <Text style={s.fine}>{DISCLAIMER}</Text>
    </View>
  );
}

/* --------------------------------- screens --------------------------------- */
function ReadTab({ surahs, recent, onOpen, loadError }) {
  const [q, setQ] = useState('');
  const list = surahs.filter((x) => {
    const t = q.trim().toLowerCase();
    return !t || x.englishName.toLowerCase().includes(t) || x.englishNameTranslation.toLowerCase().includes(t) || String(x.number) === t;
  });
  return (
    <FlatList
      data={list}
      keyExtractor={(x) => String(x.number)}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View>
          <Text style={s.h1}>Quran</Text>
          {recent[0] && !q ? (
            <TouchableOpacity style={s.nextCard} onPress={() => onOpen(recent[0].number)}>
              <Text style={s.nextTitle}>Continue reading</Text>
              <Text style={s.nextBody}>Surah {recent[0].englishName}</Text>
            </TouchableOpacity>
          ) : null}
          <TextInput style={s.input} placeholder="Find a surah by name or number" placeholderTextColor={C.muted} value={q} onChangeText={setQ} />
          {loadError ? <Notice error>{loadError}</Notice> : null}
          {!surahs.length && !loadError ? <ActivityIndicator color={C.gold} style={{ marginTop: 24 }} /> : null}
        </View>
      }
      renderItem={({ item }) => (
        <TouchableOpacity style={s.row} onPress={() => onOpen(item.number)}>
          <Text style={s.rowNum}>{item.number}</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.rowTitle}>{item.englishName}</Text>
            <Text style={s.rowSub}>{item.englishNameTranslation}, {item.numberOfAyahs} verses, {item.revelationType}</Text>
          </View>
          <Text style={s.rowArabic}>{item.name.replace('سورة ', '')}</Text>
        </TouchableOpacity>
      )}
    />
  );
}

function Reader({ surah, target, onBack, isSaved, onToggle }) {
  const [ayahs, setAyahs] = useState(null);
  const [err, setErr] = useState(null);
  const listRef = useRef(null);

  useEffect(() => {
    let live = true;
    setAyahs(null); setErr(null);
    fetchSurah(surah.number).then((d) => live && setAyahs(d)).catch(() => live && setErr('Could not load this surah. Check your internet connection.'));
    return () => { live = false; };
  }, [surah.number]);

  useEffect(() => {
    if (ayahs && target) setTimeout(() => { try { listRef.current?.scrollToIndex({ index: target - 1, animated: true }); } catch {} }, 500);
  }, [ayahs, target]);

  return (
    <View style={{ flex: 1 }}>
      <View style={s.readerBar}>
        <TouchableOpacity onPress={onBack} hitSlop={10}><Text style={s.back}>Back</Text></TouchableOpacity>
        <Text style={s.readerTitle}>{surah.englishName}</Text>
        <View style={{ width: 40 }} />
      </View>
      {err ? <Notice error>{err}</Notice> : null}
      {!ayahs && !err ? <ActivityIndicator color={C.gold} style={{ marginTop: 40 }} /> : null}
      {ayahs ? (
        <FlatList
          ref={listRef}
          data={ayahs}
          keyExtractor={(a) => String(a.ayah)}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          onScrollToIndexFailed={(i) => setTimeout(() => listRef.current?.scrollToIndex({ index: i.index, animated: false }), 400)}
          ListHeaderComponent={
            surah.number !== 1 && surah.number !== 9 ? <Text style={s.bismillah}>بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ</Text> : null
          }
          renderItem={({ item }) => {
            const v = { ref: `${surah.number}:${item.ayah}`, surah: surah.number, surahName: surah.englishName, ayah: item.ayah, arabic: item.arabic, english: item.english };
            return <VerseCard v={v} saved={isSaved(v.ref)} onToggle={() => onToggle(v)} highlight={item.ayah === target} />;
          }}
        />
      ) : null}
    </View>
  );
}

function AskTab(props) {
  const { isSaved, onToggle, openVerse, onOpenSurah } = props;
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [history, setHistory] = useState([]);
  const examples = ['Verses about patience in hardship', 'Comfort when I feel anxious', 'What does the Quran say about parents?', 'Gratitude and blessings', 'Forgiveness and repentance'];

  const run = useCallback(async (text) => {
    const query = (text ?? q).trim();
    if (!query || busy) return;
    setQ(query); setBusy(true); setErr(null); setData(null);
    try {
      setData(await callServer('/api/ask', { query, history }));
      setHistory((h) => [...h, query].slice(-5));
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }, [q, busy, history]);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Text style={s.h1}>Ask</Text>
      <Text style={s.lead}>Describe a topic, a feeling or a question. Noor searches the Quran and shows verses with a short explanation of why each fits.</Text>
      <TextInput
        style={[s.input, { minHeight: 64, textAlignVertical: 'top' }]}
        placeholder="For example: I'm worried about my future"
        placeholderTextColor={C.muted}
        value={q} onChangeText={setQ} multiline
      />
      <TouchableOpacity style={[s.btn, busy && { opacity: 0.6 }]} onPress={() => run()} disabled={busy}>
        <Text style={s.btnText}>{busy ? 'Searching the Quran…' : 'Search with AI'}</Text>
      </TouchableOpacity>
      {!data && !busy && (
        <View style={s.chipWrap}>{examples.map((e) => <Chip key={e} label={e} onPress={() => run(e)} />)}</View>
      )}
      {busy && <ActivityIndicator color={C.gold} style={{ marginTop: 28 }} />}
      {err && <Notice error>{err}</Notice>}
      {data && <AIResult data={data} isSaved={isSaved} onToggle={onToggle} onOpen={openVerse} onFollowUp={run} onOpenSurah={onOpenSurah} />}
    </ScrollView>
  );
}

const MOODS = ['Anxious', 'Sad', 'Grateful', 'Hopeful', 'Lost', 'Lonely', 'Need patience', 'Seeking forgiveness', 'Need strength'];

function ForYouTab({ bookmarks, recent, isSaved, onToggle, openVerse, onOpenSurah }) {
  const [mood, setMood] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  const go = async () => {
    if (busy) return;
    setBusy(true); setErr(null); setData(null);
    try {
      setData(await callServer('/api/recommend', {
        mood, note,
        bookmarks: bookmarks.slice(0, 15).map((b) => b.ref),
        recent: recent.slice(0, 6).map((r) => r.englishName),
      }));
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Text style={s.h1}>For you</Text>
      <Text style={s.lead}>Choose how you feel today. Noor also looks at the verses you saved and the surahs you read to tailor the picks.</Text>
      <View style={s.chipWrap}>
        {MOODS.map((m) => <Chip key={m} label={m} active={mood === m} onPress={() => setMood(mood === m ? null : m)} />)}
      </View>
      <TextInput style={s.input} placeholder="Anything else on your mind? (optional)" placeholderTextColor={C.muted} value={note} onChangeText={setNote} />
      <TouchableOpacity style={[s.btn, busy && { opacity: 0.6 }]} onPress={go} disabled={busy}>
        <Text style={s.btnText}>{busy ? 'Preparing your verses…' : 'Get my recommendations'}</Text>
      </TouchableOpacity>
      <Text style={s.fine}>Based on {bookmarks.length} saved verse{bookmarks.length === 1 ? '' : 's'} and {recent.length} recent surah{recent.length === 1 ? '' : 's'}.</Text>
      {busy && <ActivityIndicator color={C.gold} style={{ marginTop: 28 }} />}
      {err && <Notice error>{err}</Notice>}
      {data && <AIResult data={data} isSaved={isSaved} onToggle={onToggle} onOpen={openVerse} onFollowUp={() => {}} onOpenSurah={onOpenSurah} />}
    </ScrollView>
  );
}

function SavedTab({ bookmarks, onToggle, openVerse }) {
  return (
    <FlatList
      data={bookmarks}
      keyExtractor={(v) => v.ref}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      ListHeaderComponent={<Text style={s.h1}>Saved</Text>}
      ListEmptyComponent={<Notice>Nothing saved yet. Tap Save on any verse to keep it here.</Notice>}
      renderItem={({ item }) => <VerseCard v={item} saved onToggle={() => onToggle(item)} onOpen={() => openVerse(item)} />}
    />
  );
}

/* ----------------------------------- app ----------------------------------- */
const TABS = [['read', 'Read'], ['ask', 'Ask'], ['foryou', 'For you'], ['saved', 'Saved']];

export default function App() {
  useFonts({ Amiri_400Regular }); // Arabic falls back to the system font until loaded
  const [tab, setTab] = useState('read');
  const [surahs, setSurahs] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [open, setOpen] = useState(null); // { surah, target }
  const [bookmarks, setBookmarks] = useState([]);
  const [recent, setRecent] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      setBookmarks(await store.get('bookmarks', []));
      setRecent(await store.get('recent', []));
      setReady(true);
      try { setSurahs(await fetchSurahs()); } catch { setLoadError('Could not load the surah list. Check your internet connection and reload.'); }
    })();
  }, []);
  useEffect(() => { if (ready) store.set('bookmarks', bookmarks); }, [bookmarks, ready]);
  useEffect(() => { if (ready) store.set('recent', recent); }, [recent, ready]);

  const isSaved = (ref) => bookmarks.some((b) => b.ref === ref);
  const toggle = (v) => setBookmarks((b) => (b.some((x) => x.ref === v.ref) ? b.filter((x) => x.ref !== v.ref) : [{ ...v, reason: undefined }, ...b]));

  const openSurah = (number, target) => {
    const surah = surahs.find((x) => x.number === number) || { number, englishName: `Surah ${number}` };
    setOpen({ surah, target });
    setRecent((r) => [{ number, englishName: surah.englishName, at: Date.now() }, ...r.filter((x) => x.number !== number)].slice(0, 10));
  };
  const openVerse = (v) => openSurah(v.surah, v.ayah);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={s.screen}>
        <StatusBar style="light" />
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {open ? (
            <Reader surah={open.surah} target={open.target} onBack={() => setOpen(null)} isSaved={isSaved} onToggle={toggle} />
          ) : (
            <View style={{ flex: 1 }}>
              <View style={{ flex: 1 }}>
                {tab === 'read' && <ReadTab surahs={surahs} recent={recent} onOpen={(n) => openSurah(n)} loadError={loadError} />}
                {tab === 'ask' && <AskTab isSaved={isSaved} onToggle={toggle} openVerse={openVerse} onOpenSurah={(n) => openSurah(n)} />}
                {tab === 'foryou' && <ForYouTab bookmarks={bookmarks} recent={recent} isSaved={isSaved} onToggle={toggle} openVerse={openVerse} onOpenSurah={(n) => openSurah(n)} />}
                {tab === 'saved' && <SavedTab bookmarks={bookmarks} onToggle={toggle} openVerse={openVerse} />}
              </View>
              <View style={s.tabs}>
                {TABS.map(([k, label]) => (
                  <TouchableOpacity key={k} style={s.tab} onPress={() => setTab(k)}>
                    <Text style={[s.tabText, tab === k && { color: C.gold }]}>{label}</Text>
                    {tab === k && <View style={s.tabDot} />}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

/* ---------------------------------- styles --------------------------------- */
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  h1: { color: C.text, fontSize: 30, fontWeight: '700', marginBottom: 6, marginTop: 4 },
  lead: { color: C.muted, fontSize: 15, lineHeight: 22, marginBottom: 16 },
  fine: { color: C.muted, fontSize: 12, lineHeight: 18, marginTop: 14 },
  input: { backgroundColor: C.surface, color: C.text, borderColor: C.line, borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16, marginBottom: 12 },
  btn: { backgroundColor: C.gold, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  btnText: { color: C.bg, fontWeight: '700', fontSize: 16 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 14 },
  chip: { borderColor: C.line, borderWidth: 1, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 },
  chipOn: { backgroundColor: C.gold, borderColor: C.gold },
  chipText: { color: C.text, fontSize: 14 },
  card: { backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 12 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  ref: { color: C.gold, fontSize: 14, fontWeight: '600' },
  icon: { color: C.muted, fontSize: 14 },
  arabic: { color: C.text, fontFamily: ARABIC, fontSize: 28, lineHeight: 52, textAlign: 'right', writingDirection: 'rtl' },
  english: { color: C.text, fontSize: 16, lineHeight: 25, marginTop: 12, opacity: 0.92 },
  reason: { borderLeftColor: C.gold, borderLeftWidth: 3, paddingLeft: 12, marginTop: 14 },
  reasonText: { color: C.muted, fontSize: 14, lineHeight: 21 },
  aiBox: { backgroundColor: C.raised, borderRadius: 14, padding: 16, marginVertical: 14 },
  aiLabel: { color: C.gold, fontWeight: '700', marginBottom: 6 },
  aiMsg: { color: C.text, fontSize: 16, lineHeight: 24 },
  nextCard: { backgroundColor: C.raised, borderColor: C.gold, borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 14 },
  nextTitle: { color: C.gold, fontWeight: '700', fontSize: 15 },
  nextBody: { color: C.text, marginTop: 4, lineHeight: 21 },
  notice: { borderColor: C.line, borderWidth: 1, borderRadius: 12, padding: 14, marginVertical: 12 },
  noticeText: { color: C.muted, lineHeight: 21 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomColor: C.line, borderBottomWidth: StyleSheet.hairlineWidth, gap: 14 },
  rowNum: { color: C.gold, width: 30, fontWeight: '700', textAlign: 'center' },
  rowTitle: { color: C.text, fontSize: 17, fontWeight: '600' },
  rowSub: { color: C.muted, fontSize: 13, marginTop: 2 },
  rowArabic: { color: C.text, fontFamily: ARABIC, fontSize: 24 },
  readerBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomColor: C.line, borderBottomWidth: StyleSheet.hairlineWidth },
  readerTitle: { color: C.text, fontSize: 18, fontWeight: '700' },
  back: { color: C.gold, fontSize: 16, width: 40 },
  bismillah: { color: C.gold, fontFamily: ARABIC, fontSize: 30, textAlign: 'center', marginVertical: 18 },
  tabs: { flexDirection: 'row', borderTopColor: C.line, borderTopWidth: 1, backgroundColor: C.surface },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  tabText: { color: C.muted, fontSize: 15, fontWeight: '600' },
  tabDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.gold, marginTop: 5 },
});
