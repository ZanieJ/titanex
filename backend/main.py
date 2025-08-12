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
TABLE_NAME = os.getenv("TABLE_NAME")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

app = FastAPI()

# Allow frontend calls
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

    if results:
        supabase.table(TABLE_NAME).insert(results).execute()

    return {"results": results}
