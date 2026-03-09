import json
from pathlib import Path

def load_quran():

    base_dir = Path(__file__).resolve().parent.parent
    file_path = base_dir / "data" / "quran.json"

    with open(file_path, "r", encoding="utf-8") as f:
        verses = json.load(f)

    print(f"{len(verses)} verses loaded")

    return verses