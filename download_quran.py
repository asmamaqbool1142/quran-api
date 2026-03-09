# download_quran.py
import requests
import json

# API URL for full Quran in Uthmani script
url = "https://api.alquran.cloud/v1/quran/quran-uthmani"

response = requests.get(url)
data = response.json()

with open("quran.json", "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("Full Quran downloaded and saved as quran.json")