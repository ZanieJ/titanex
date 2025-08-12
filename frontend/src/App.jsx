import React, { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";

// ✅ Correct PDF.js ESM build + worker
import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.min.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs";

// ✅ Load Tesseract from ESM CDN when needed
const loadTesseract = async () => {
  const { createWorker } = await import(
    "https://cdn.jsdelivr.net/npm/tesseract.js@5.0.5/dist/tesseract.esm.min.js"
  );
  return createWorker;
};

// ✅ Supabase from ESM CDN
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.43.4/+esm";

// Init Supabase
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function App() {
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState("");
  const [results, setResults] = useState([]);

  const onDrop = useCallback(async (acceptedFiles) => {
    setProcessing(true);
    setStatus("Processing files...");

    const createWorker = await loadTesseract();

    for (const file of acceptedFiles) {
      if (file.type === "application/pdf") {
        const pdfArrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: pdfArrayBuffer }).promise;

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          setStatus(`Processing page ${pageNum} of ${pdf.numPages}...`);
          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale: 2 });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          await page.render({ canvasContext: context, viewport }).promise;

          const worker = await createWorker();
          await worker.loadLanguage("eng");
          await worker.initialize("eng");
          const {
            data: { text },
          } = await worker.recognize(canvas);

          setResults((prev) => [...prev, { file: file.name, page: pageNum, text }]);

          // Insert into Supabase
          await supabase.from("NDAs").insert({
            pallet_id: "some-pallet-id", // replace if needed
            document_name: file.name,
            page_number: pageNum,
          });

          await worker.terminate();
        }
      }
    }

    setStatus("Processing complete!");
    setProcessing(false);
  }, []);

  const { getRootProps, getInputProps } = useDropzone({ onDrop });

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h1>PDF OCR & Supabase Upload</h1>
      <div
        {...getRootProps()}
        style={{
          border: "2px dashed #ccc",
          padding: "20px",
          textAlign: "center",
          cursor: "pointer",
        }}
      >
        <input {...getInputProps()} />
        <p>Drag & drop PDF files here, or click to select files</p>
      </div>
      {processing && <p>{status}</p>}
      {!processing && status && <p>{status}</p>}
      {results.length > 0 && (
        <div>
          <h2>OCR Results</h2>
          {results.map((r, i) => (
            <div key={i}>
              <strong>{r.file} (Page {r.page}):</strong>
              <pre>{r.text}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
