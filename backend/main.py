from fastapi import FastAPI, File, UploadFile
import shutil
from ocr_pipeline import process_pdf
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client
from dotenv import load_dotenv
import os

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
TABLE_NAME = os.getenv("TABLE_NAME", "Pallet_IDs")

if SUPABASE_URL and SUPABASE_KEY:
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
else:
    supabase = None

app = FastAPI(title="Titanex Pallet ID Extractor API")

# Allow frontend calls (in production restrict origins)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/extract")
async def extract_pallet_ids(file: UploadFile = File(...)):
    pdf_path = f"temp_{file.filename}"
    with open(pdf_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    results = process_pdf(pdf_path)

    # Insert into Supabase if configured
    if supabase and results:
        try:
            supabase.table(TABLE_NAME).insert(results).execute()
        except Exception as e:
            # don't fail the request if DB insert fails; return results nonetheless
            print("Supabase insert failed:", e)

    # cleanup uploaded file
    try:
        os.remove(pdf_path)
    except Exception:
        pass

    return {"results": results}
