import React, { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";

// We'll dynamically import heavy libs from CDN at runtime to avoid bundling issues.
// Supabase client will also be loaded via CDN ESM to avoid needing a local install.

const loadSupabase = async () => {
  const mod = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.43.4/+esm');
  return mod.createClient;
};

const loadPdfJs = async () => {
  // load ESM build of pdfjs from jsdelivr
  await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.min.mjs');
  return window['pdfjs-dist/build/pdf'];
};

const loadTesseract = async () => {
  const mod = await import('https://cdn.jsdelivr.net/npm/tesseract.js@5.0.5/dist/tesseract.esm.min.js');
  return mod.createWorker;
};

export default function App() {
  const [status, setStatus] = useState('Idle');
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);

  const onDrop = useCallback(async (acceptedFiles) => {
    setError(null);
    setStatus('Loading libraries...');

    try {
      const createClient = await loadSupabase();
      const pdfjsLib = await loadPdfJs();
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.js';
      const createWorker = await loadTesseract();

      // init supabase client with env vars
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;
      if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('VITE_SUPABASE_URL or VITE_SUPABASE_KEY missing.');
      const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

      for (const file of acceptedFiles) {
        setStatus(`Processing ${file.name}...`);

        if (file.type !== 'application/pdf' && !file.type.startsWith('image/')) {
          setStatus('Unsupported file, skipping.');
          continue;
        }

        // Read file into array buffer
        const arrayBuffer = await file.arrayBuffer();

        if (file.type === 'application/pdf') {
          const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
          const pdf = await loadingTask.promise;

          for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            setStatus(`Rendering page ${pageNum}/${pdf.numPages}...`);
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: 2.0 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');
            await page.render({ canvasContext: ctx, viewport }).promise;

            setStatus('Running OCR (Tesseract)...');
            const worker = await createWorker();
            await worker.loadLanguage('eng');
            await worker.initialize('eng');
            const { data: { text } } = await worker.recognize(canvas);
            await worker.terminate();

            // extract pallet ids (simple numeric sequences 14-18 digits)
            const ids = Array.from(new Set((text.match(/\b\d{14,18}\b/g) || [])));
            if (ids.length === 0) {
              setStatus('No IDs found on page, continuing.');
            } else {
              setStatus(`Found ${ids.length} IDs on page, saving...`);
              // insert into NDAs table
              const rows = ids.map(id => ({ pallet_id: id, document_name: file.name, page_number: pageNum }));
              const { error: dbErr } = await supabase.from('NDAs').insert(rows);
              if (dbErr) {
                console.warn('Supabase insert error:', dbErr);
                setError('Supabase insert failed: ' + dbErr.message);
              } else {
                setResults(prev => prev.concat(rows));
              }
            }
          }
        } else {
          // image file: run OCR directly
          const blob = new Blob([arrayBuffer], { type: file.type });
          const worker = await createWorker();
          await worker.loadLanguage('eng');
          await worker.initialize('eng');
          const { data: { text } } = await worker.recognize(blob);
          await worker.terminate();

          const ids = Array.from(new Set((text.match(/\b\d{14,18}\b/g) || [])));
          if (ids.length > 0) {
            const rows = ids.map(id => ({ pallet_id: id, document_name: file.name, page_number: 1 }));
            const { error: dbErr } = await supabase.from('NDAs').insert(rows);
            if (dbErr) setError('Supabase insert failed: ' + dbErr.message);
            else setResults(prev => prev.concat(rows));
          }
        }
      }

      setStatus('Done');
    } catch (err) {
      console.error(err);
      setError(err.message || String(err));
      setStatus('Failed');
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, multiple: true });

  return (
    <div style={{ padding: 20, fontFamily: 'Arial, sans-serif' }}>
      <h1>Titanex Pallet ID Extractor</h1>
      <div {...getRootProps()} style={{ border: '2px dashed #ccc', padding: 20, textAlign: 'center' }}>
        <input {...getInputProps()} accept="application/pdf,image/*" />
        {isDragActive ? <p>Drop files here...</p> : <p>Drag & drop PDFs or images here, or click to select</p>}
      </div>

      <p><strong>Status:</strong> {status}</p>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      {results.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h2>Inserted rows</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={{ border: '1px solid #ddd', padding: 6 }}>Pallet ID</th><th style={{ border: '1px solid #ddd', padding: 6 }}>Document</th><th style={{ border: '1px solid #ddd', padding: 6 }}>Page</th></tr></thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i}><td style={{ border: '1px solid #ddd', padding: 6 }}>{r.pallet_id}</td><td style={{ border: '1px solid #ddd', padding: 6 }}>{r.document_name}</td><td style={{ border: '1px solid #ddd', padding: 6 }}>{r.page_number}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
