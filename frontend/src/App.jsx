// src/App.jsx
import React, { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import * as pdfjsLib from "pdfjs-dist/build/pdf";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";
import { createClient } from "@supabase/supabase-js";
import Tesseract from "tesseract.js";

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

// Supabase connection from env vars
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
  throw new Error("Supabase URL and Key must be set in environment variables");
}
const supabase = createClient(supabaseUrl, supabaseKey);

export default function App() {
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [uploads, setUploads] = useState([]);

  const onDrop = useCallback(async (acceptedFiles) => {
    setError("");
    setUploads([]);
    for (const file of acceptedFiles) {
      try {
        setStatus(`Reading PDF: ${file.name}`);
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          setStatus(`Processing page ${pageNum} of ${file.name}`);
          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale: 2 });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          await page.render({ canvasContext: context, viewport }).promise;

          // Run OCR on page image
          const { data: { text } } = await Tesseract.recognize(canvas, "eng");
          
          // Extract pallet_id (customize this regex if needed)
          const palletIdMatch = text.match(/Pallet\s*ID\s*[:\-]?\s*(\S+)/i);
          const pallet_id = palletIdMatch ? palletIdMatch[1] : "UNKNOWN";

          // Insert into Supabase NDAs table
          const { error: insertError } = await supabase
            .from("NDAs")
            .insert([
              {
                pallet_id,
                document_name: file.name,
                page_number: pageNum,
              },
            ]);

          if (insertError) throw insertError;

          setUploads((prev) => [
            ...prev,
            { file: file.name, page: pageNum, pallet_id }
          ]);
        }
      } catch (err) {
        console.error(err);
        setError(`Failed to process ${file.name}: ${err.message}`);
      }
    }
    setStatus("All files processed.");
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] }
  });

  return (
    <div style={{ fontFamily: "sans-serif", padding: 20 }}>
      <h1>PDF OCR & Supabase Upload</h1>
      <div
        {...getRootProps()}
        style={{
          border: "2px dashed #aaa",
          padding: 20,
          textAlign: "center",
          background: isDragActive ? "#f0f8ff" : "white"
        }}
      >
        <input {...getInputProps()} />
        {isDragActive
          ? <p>Drop the PDF files here...</p>
          : <p>Drag & drop PDF files, or click to select</p>}
      </div>

      {status && <p><strong>Status:</strong> {status}</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      {uploads.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h2>Uploaded Pages</h2>
          <ul>
            {uploads.map((u, idx) => (
              <li key={idx}>
                {u.file} — Page {u.page} — Pallet ID: {u.pallet_id}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
