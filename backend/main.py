# backend/main.py
from fastapi import FastAPI, HTTPException
from backend.quran_loader import load_quran  # Make sure this imports correctly

app = FastAPI()

# Load all verses on startup
verses = load_quran()

@app.get("/")
def read_root():
    return {"message": "Quran API is running!"}

@app.get("/verses")
def get_verses():
    return {"verses_loaded": len(verses)}

@app.get("/verses/{surah}/{ayah}")
def get_specific_verse(surah: int, ayah: int):
    # Quran is usually structured as a list of dicts like: {"surah": 1, "ayah": 1, "text": "..."}
    for v in verses:
        if v["surah"] == surah and v["ayah"] == ayah:
            return {"surah": surah, "ayah": ayah, "text": v["text"]}
    # If not found
    raise HTTPException(status_code=404, detail="Verse not found")