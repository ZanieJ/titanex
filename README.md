Titanex Pallet ID Extractor

Frontend-only app that loads PDF.js, Tesseract, and Supabase from CDNs at runtime.

Setup:
- Add Netlify environment variables VITE_SUPABASE_URL and VITE_SUPABASE_KEY
- Deploy frontend folder as a Vite app (Netlify will run npm install for react etc.)

Note: This build avoids bundling heavy libs by loading them at runtime from CDNs.
