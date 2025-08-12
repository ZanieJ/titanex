# titanex-pallet-id-extractor

Titanex Pallet ID Extractor — Full-stack app that extracts pallet IDs from PDF documents using EasyOCR (primary) and PaddleOCR (fallback). Extracted results are optionally inserted into a Supabase table (Pallet_IDs).

## Repo layout
- backend/: FastAPI server and OCR pipeline (Python)
- frontend/: React + Vite UI (drag & drop PDFs, display results)

## Quick start (local)
### Backend
1. Create a virtualenv and install dependencies:
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

2. Copy `.env.example` to `.env` and fill in your Supabase variables (or leave blank to skip DB inserts).
3. Run the API:
```bash
uvicorn backend.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000 and drag & drop PDFs into the UI.

## Notes
- OCR engines are configured for **English only** to improve speed and reliability.
- Crop ratios in `backend/ocr_pipeline.py::preprocess_image_for_column()` assume the pallet ID column is on the left. Adjust if your documents differ.
- If you want Supabase inserts disabled, leave `.env` empty or remove SUPABASE_* values.

## Deployment
- Backend can be deployed to any Python-capable host (Render, Fly, AWS EC2 ECS, etc.).
- Frontend is a static React app built with Vite; host on Netlify, Vercel, or static file host.
