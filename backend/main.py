# backend/main.py
from fastapi import FastAPI, HTTPException, Query
from backend.rag_engine import search_verses
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
def get_verse(surah: int, ayah: int, translation: str = Query("arabic")):
    """
    Get a verse by surah and ayah.
    translation: arabic (default), english, urdu
    """
    # Validate translation key
    allowed_translations = ["arabic", "english", "urdu"]
    if translation not in allowed_translations:
        raise HTTPException(status_code=400, detail=f"Translation must be one of {allowed_translations}")
    
    # Find the verse
    for v in verses:
        if v["surah"] == surah and v["ayah"] == ayah:
            return {
                "surah": surah,
                "ayah": ayah,
                "text": v.get(translation, v["arabic"])  # fallback to Arabic if missing
            }

    raise HTTPException(status_code=404, detail="Verse not found")


@app.get("/surah/{surah}")
def get_surah(surah: int, translation: str = Query("arabic")):
    """
    Get all ayahs of a Surah.
    translation: arabic (default), english, urdu
    """
    allowed_translations = ["arabic", "english", "urdu"]
    if translation not in allowed_translations:
        raise HTTPException(status_code=400, detail=f"Translation must be one of {allowed_translations}")

    # Filter verses of the requested surah
    surah_verses = [
        {"ayah": v["ayah"], "text": v.get(translation, v["arabic"])}
        for v in verses if v["surah"] == surah
    ]

    if not surah_verses:
        raise HTTPException(status_code=404, detail="Surah not found")

    return {
        "surah": surah,
        "ayahs": surah_verses
    }


@app.get("/search")
def search(query: str):
    results = search_verses(query, verses)

    return {
        "query": query,
        "results": results
    }