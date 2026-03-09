# backend/quran_loader.py
import json

def load_quran():
    with open("quran.json", "r", encoding="utf-8") as f:
        data = json.load(f)

    verses = []
    # Go through each surah and each ayah
    for surah in data["data"]["surahs"]:
        for ayah in surah["ayahs"]:
            verses.append({
                "surah": surah["number"],
                "ayah": ayah["numberInSurah"],
                "text": ayah["text"]
            })

    print(f"{len(verses)} verses loaded from quran.json")
    return verses