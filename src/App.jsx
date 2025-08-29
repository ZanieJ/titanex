import React, { useCallback, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import * as pdfjsLib from "pdfjs-dist";
import { createClient } from "@supabase/supabase-js";
import * as ocr from "@paddlejs-models/ocr"; // <-- PaddleOCR (browser)

import pdfWorker from "pdfjs-dist/build/pdf.worker?worker";

// Wire up pdf.js worker (same as your project)
pdfjsLib.GlobalWorkerOptions.workerPort = new pdfWorker();

const supabase = createClient(
  "https://cassouhzovotgdhzssqg.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhc3NvdWh6b3ZvdGdkaHpzc3FnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkxMTg5MjYsImV4cCI6MjA2NDY5NDkyNn0.dNg51Yn9aplsyAP9kvsEQOTHWb64edsAk5OqiynEZlk"
);

const App = () => {
  const [results, setResults] = useState([]);
  const [processing, setProcessing] = useState(false);
  const ocrReadyRef = useRef(false); // init PaddleOCR once

  // Strict 18‑digit extractor (de‑duped)
  const extractPalletIds = (text) => {
    const regex = /\b\d{18}\b/g;
    const matches = text ? [...text.matchAll(regex)].map((m) => m[0]) : [];
    const seen = new Set();
    const unique = [];
    for (const id of matches) {
      if (!seen.has(id)) {
        seen.add(id);
        unique.push(id);
      }
    }
    return unique;
  };

  const onDrop = useCallback(async (acceptedFiles) => {
    setProcessing(true);
    let finalResults = [];

    for (const file of acceptedFiles) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);

          // Render page to canvas (slightly higher scale for OCR clarity)
          const viewport = page.getViewport({ scale: 2.3 });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          await page.render({ canvasContext: context, viewport }).promise;

          // ---- PaddleOCR: init once, then recognize with rotations ----
          if (!ocrReadyRef.current) {
            await ocr.init(); // downloads & warms up the model
            ocrReadyRef.current = true;
          }

          const angles = [0, 90, 180, 270];
          let combinedText = "";

          for (const angle of angles) {
            // rotate canvas -> rCanvas
            const rCanvas = document.createElement("canvas");
            const rCtx = rCanvas.getContext("2d");

            if (angle % 180 === 0) {
              rCanvas.width = canvas.width;
              rCanvas.height = canvas.height;
            } else {
              rCanvas.width = canvas.height;
              rCanvas.height = canvas.width;
            }

            rCtx.save();
            rCtx.translate(rCanvas.width / 2, rCanvas.height / 2);
            rCtx.rotate((angle * Math.PI) / 180);
            rCtx.drawImage(
              canvas,
              -canvas.width / 2,
              -canvas.height / 2,
              canvas.width,
              canvas.height
            );
            rCtx.restore();

            // Run PaddleOCR on the rotated page image
            const { text } = await ocr.recognize(rCanvas);
            combinedText += "\n" + (text || "");

            // Early exit once we detect any 18‑digit number
            if (/\b\d{18}\b/.test(combinedText)) break;
          }
          // ---- end PaddleOCR block ----

          // Extract & record all 18‑digit IDs found on this page
          const ids = extractPalletIds(combinedText);
          ids.forEach((id) => {
            finalResults.push({
              pallet_id: id,
              document_name: file.name,
              page_number: pageNum,
            });
          });
        }
      } catch (err) {
        alert("Failed processing PDF: " + err.message);
        console.error(err);
      }
    }

    setResults(finalResults);
    setProcessing(false);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [] },
  });

  const uploadToSupabase = async () => {
    const { error } = await supabase.from("NDAs").insert(results);
    if (error) {
      alert("Upload failed: " + error.message);
    } else {
      alert("Upload successful!");
    }
  };

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Melissa OCR Pallet ID Extractor</h1>

      <div
        {...getRootProps()}
        className={`border-4 border-dashed rounded-xl p-10 text-center transition ${
          isDragActive ? "border-blue-500 bg-blue-50" : "border-gray-300"
        }`}
      >
        <input {...getInputProps()} />
        {isDragActive ? (
          <p className="text-blue-500">Drop the PDFs here...</p>
        ) : (
          <p className="text-gray-600">Drag & drop PDF files here</p>
        )}
      </div>

      {processing && <p className="mt-4 text-yellow-600">Processing PDFs...</p>}

      {results.length > 0 && (
        <>
          <table className="table-auto w-full border mt-6 text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="border px-2 py-1">Pallet ID</th>
                <th className="border px-2 py-1">Document</th>
                <th className="border px-2 py-1">Page</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i}>
                  <td className="border px-2 py-1 font-mono">{r.pallet_id}</td>
                  <td className="border px-2 py-1">{r.document_name}</td>
                  <td className="border px-2 py-1">{r.page_number}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            onClick={uploadToSupabase}
            className="mt-4 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          >
            Upload to Supabase
          </button>
        </>
      )}
    </div>
  );
};

export default App;
