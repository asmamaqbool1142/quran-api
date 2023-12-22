/**
 * Noor – AI agent server
 * Claude acts as an agent with tools that query the real Quran database.
 * Verse text is ALWAYS fetched from the source (never written by the AI),
 * and any reference the AI invents that doesn't exist is dropped.
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const AnthropicPkg = require('@anthropic-ai/sdk');
const Anthropic = AnthropicPkg.default || AnthropicPkg;

const PORT = process.env.PORT || 3000;
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5-5';
const QURAN = 'https://api.alquran.cloud/v1';
const client = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

/* ---------------------------- Quran data layer ---------------------------- */
const cache = new Map();
async function qget(path) {
  if (cache.has(path)) return cache.get(path);
  try {
    const r = await fetch(QURAN + path);
    const j = await r.json();
    if (j.code !== 200) return null;
    cache.set(path, j.data);
    return j.data;
  } catch (e) {
    console.error('Quran API error:', path, e.message);
    return null;
  }
}

const plain = (t) => t.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '');
// The source prefixes the Bismillah to ayah 1 of most surahs; show it separately in the app.
function cleanArabic(text, surah, ayah) {
  if (ayah !== 1 || surah === 1 || surah === 9) return text;
  const words = text.split(' ');
  return words.length > 4 && plain(words[0]) === 'بسم' ? words.slice(4).join(' ') : text;
}

async function getAyah(ref) {
  const m = /^(\d{1,3}):(\d{1,3})$/.exec(String(ref).trim());
  if (!m) return null;
  const s = +m[1], a = +m[2];
  if (s < 1 || s > 114 || a < 1) return null;
  const data = await qget(`/ayah/${s}:${a}/editions/quran-uthmani,en.sahih`);
  if (!Array.isArray(data)) return null;
  const ar = data.find((d) => d.edition.identifier === 'quran-uthmani');
  const en = data.find((d) => d.edition.identifier === 'en.sahih');
  if (!ar || !en) return null;
  return {
    ref: `${s}:${a}`,
    surah: s,
    surahName: en.surah.englishName,
    ayah: a,
    arabic: cleanArabic(ar.text, s, a),
    english: en.text,
  };
}

async function searchQuran(keyword) {
  const kw = String(keyword || '').trim().split(/\s+/)[0];
  if (!kw) return { error: 'keyword is empty' };
  const data = await qget(`/search/${encodeURIComponent(kw)}/all/en.sahih`);
  if (!data || !data.matches) return { keyword: kw, total_matches: 0, results: [] };
  const all = data.matches;
  const step = Math.max(1, Math.floor(all.length / 12)); // sample across the whole Quran
  const results = [];
  for (let i = 0; i < all.length && results.length < 12; i += step) {
    const m = all[i];
    results.push({
      ref: `${m.surah.number}:${m.numberInSurah}`,
      surah: m.surah.englishName,
      text: m.text.slice(0, 280),
    });
  }
  return { keyword: kw, total_matches: data.count, results };
}

/* --------------------------------- Agent --------------------------------- */
const SYSTEM = `You are Noor, a respectful Quran study companion inside a mobile app.

Your job: help people find and reflect on verses of the Quran that match their question, feeling or situation.

How you work:
- You have tools. Use search_quran (English keyword search, ONE word per call) several times with different synonyms, and use your own knowledge of the Quran to propose references. Always confirm candidate references with get_verses before presenting them.
- Finish by calling respond. Pick 3-6 verses (fewer if few are truly relevant). Each "reason" is 1-2 plain sentences explaining how the verse relates to the person's need.
- Never write or paraphrase verse text yourself; the app displays the verified text from the reference you give.
- Reply in the same language the person wrote in.

Adab and limits:
- You are not a scholar or mufti. Never issue fatwas or religious rulings. For rulings (halal/haram, worship details, family or legal disputes), share relevant verses and gently suggest asking a qualified scholar.
- Be warm, humble and non-judgmental. If someone seems in serious distress or at risk of self-harm, respond with compassion, include comforting verses, and encourage them to reach out to a trusted person or local emergency/crisis services.
- Do not take sides in sectarian or political disputes. Do not attribute interpretations to named scholars unless you are certain.
- If a request is unrelated to the Quran or Islamic reflection, say so briefly and steer back.`;

const TOOLS = [
  {
    name: 'search_quran',
    description:
      'Keyword search in the Sahih International English translation. Pass ONE English word (e.g. "patience"). Returns up to 12 sample matches spread across the Quran plus the total match count. Try several synonyms.',
    input_schema: {
      type: 'object',
      properties: { keyword: { type: 'string' } },
      required: ['keyword'],
    },
  },
  {
    name: 'get_verses',
    description:
      'Fetch and verify verses by reference ("surah:ayah", e.g. "2:286"). Max 10 per call. Returns Arabic and English, or marks the reference invalid.',
    input_schema: {
      type: 'object',
      properties: { refs: { type: 'array', items: { type: 'string' }, maxItems: 10 } },
      required: ['refs'],
    },
  },
  {
    name: 'respond',
    description: 'Give the final answer to the user. Call this once you have verified verses.',
    input_schema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Short, warm intro (2-4 sentences) tying the verses together.' },
        verses: {
          type: 'array',
          maxItems: 8,
          items: {
            type: 'object',
            properties: {
              ref: { type: 'string', description: '"surah:ayah"' },
              reason: { type: 'string' },
            },
            required: ['ref', 'reason'],
          },
        },
        next_surah: {
          type: 'object',
          description: 'Optional: a surah worth reading next (mainly for recommendations).',
          properties: { number: { type: 'integer' }, reason: { type: 'string' } },
          required: ['number', 'reason'],
        },
        follow_ups: {
          type: 'array',
          maxItems: 3,
          items: { type: 'string' },
          description: 'Up to 3 short follow-up searches the user might tap.',
        },
      },
      required: ['message', 'verses'],
    },
  },
];

async function runTool(name, input) {
  if (name === 'search_quran') return searchQuran(input.keyword);
  if (name === 'get_verses') {
    const refs = (input.refs || []).slice(0, 10);
    const out = await Promise.all(refs.map(getAyah));
    return out.map((v, i) =>
      v ? { ref: v.ref, surah: v.surahName, arabic: v.arabic, english: v.english } : { ref: refs[i], invalid: true }
    );
  }
  return { error: 'unknown tool' };
}

async function hydrate(input) {
  const verses = (await Promise.all((input.verses || []).slice(0, 8).map((v) => getAyah(v.ref))))
    .map((v, i) => (v ? { ...v, reason: input.verses[i].reason } : null))
    .filter(Boolean);
  const seen = new Set();
  const unique = verses.filter((v) => (seen.has(v.ref) ? false : seen.add(v.ref)));
  return {
    message: input.message,
    verses: unique,
    next_surah: input.next_surah || null,
    follow_ups: input.follow_ups || [],
  };
}

async function runAgent(userPrompt) {
  if (!client) {
    const e = new Error('ANTHROPIC_API_KEY is missing. Copy server/.env.example to server/.env and add your key.');
    e.status = 500;
    throw e;
  }
  const messages = [{ role: 'user', content: userPrompt }];
  for (let step = 0; step < 8; step++) {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM,
      tools: TOOLS,
      tool_choice: { type: 'any' },
      messages,
    });
    messages.push({ role: 'assistant', content: resp.content });
    const uses = resp.content.filter((b) => b.type === 'tool_use');
    const final = uses.find((u) => u.name === 'respond');
    if (final) return hydrate(final.input);
    if (!uses.length) break;
    const results = await Promise.all(
      uses.map(async (u) => ({
        type: 'tool_result',
        tool_use_id: u.id,
        content: JSON.stringify(await runTool(u.name, u.input || {})),
      }))
    );
    messages.push({ role: 'user', content: results });
  }
  return { message: 'I could not find a good answer this time. Try rephrasing your question.', verses: [], next_surah: null, follow_ups: [] };
}

/* --------------------------------- Server --------------------------------- */
const app = express();
app.use(cors());
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, ai: !!client, model: MODEL }));

const handle = (fn) => async (req, res) => {
  try {
    res.json(await fn(req.body || {}));
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ error: e.message || 'Something went wrong' });
  }
};

app.post(
  '/api/ask',
  handle(async ({ query, history }) => {
    const q = String(query || '').trim().slice(0, 500);
    if (!q) throw Object.assign(new Error('Please type a question.'), { status: 400 });
    const prior = Array.isArray(history) ? history.slice(-3).map((h) => `- ${String(h).slice(0, 200)}`).join('\n') : '';
    return runAgent(
      `The person searched: "${q}"\n` +
        (prior ? `Their earlier searches this session:\n${prior}\n` : '') +
        `\nFind the most relevant verses (search with several keywords, verify with get_verses), then call respond.`
    );
  })
);

app.post(
  '/api/recommend',
  handle(async ({ mood, note, bookmarks, recent }) => {
    const m = String(mood || '').slice(0, 100);
    const n = String(note || '').slice(0, 400);
    const b = Array.isArray(bookmarks) ? bookmarks.slice(0, 15).join(', ') : '';
    const r = Array.isArray(recent) ? recent.slice(0, 6).join(', ') : '';
    return runAgent(
      `Personalised recommendation request.\n` +
        `Current mood/need: ${m || 'not specified'}\n` +
        `Extra context from the person: ${n || 'none'}\n` +
        `Verses they saved (refs): ${b || 'none yet'}\n` +
        `Surahs they read recently: ${r || 'none yet'}\n\n` +
        `Recommend 4-5 verses that fit how they feel now, informed by the themes in what they saved (look the saved refs up with get_verses if useful). ` +
        `Avoid repeating verses they already saved. Also suggest one surah to read next (next_surah), preferably not one they just read. Then call respond.`
    );
  })
);

app.listen(PORT, () => {
  console.log(`Noor server running on http://localhost:${PORT}  (model: ${MODEL})`);
  if (!client) console.warn('⚠  ANTHROPIC_API_KEY not set – AI endpoints will return an error until you add it to server/.env');
});
