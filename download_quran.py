import requests
import json

print("Downloading Quran data...")

arabic = requests.get("https://api.alquran.cloud/v1/quran/quran-uthmani").json()
english = requests.get("https://api.alquran.cloud/v1/quran/en.sahih").json()
urdu = requests.get("https://api.alquran.cloud/v1/quran/ur.jalandhry").json()

combined = []

for s in range(len(arabic["data"]["surahs"])):
    surah_ar = arabic["data"]["surahs"][s]
    surah_en = english["data"]["surahs"][s]
    surah_ur = urdu["data"]["surahs"][s]

    for a in range(len(surah_ar["ayahs"])):

        verse = {
            "surah": surah_ar["number"],
            "ayah": surah_ar["ayahs"][a]["numberInSurah"],
            "arabic": surah_ar["ayahs"][a]["text"],
            "english": surah_en["ayahs"][a]["text"],
            "urdu": surah_ur["ayahs"][a]["text"]
        }

        combined.append(verse)

with open("data/quran.json", "w", encoding="utf-8") as f:
    json.dump(combined, f, ensure_ascii=False, indent=2)

print("Quran saved with Arabic + English + Urdu translations")