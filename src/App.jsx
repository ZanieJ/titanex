import React, { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { createWorker } from "tesseract.js";
import * as pdfjsLib from "pdfjs-dist";
import { createClient } from "@supabase/supabase-js";

import pdfWorker from "pdfjs-dist/build/pdf.worker?worker";

pdfjsLib.GlobalWorkerOptions.workerPort = new pdfWorker();

const supabase = createClient(
  "https://cassouhzovotgdhzssqg.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhc3NvdWh6b3ZvdGdkaHpzc3FnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkxMTg5MjYsImV4cCI6MjA2NDY5NDkyNn0.dNg51Yn9aplsyAP9kvsEQOTHWb64edsAk5OqiynEZlk"
);

const App = () => {
  const [results, setResults] = useState([]);
  const [processing, setProcessing] = useState(false);

  // === Pallet ID Extraction (Exactly 18 digits) ===
  const extractPalletIds = (text) => {
    // Match exactly 18-digit numbers
    const regex = /\b\d{18}\b/g;
    return [...text.matchAll(regex)].map((match) => match[0]);
  };

  const onDrop = useCallback(async (acceptedFiles) => {
    setProcessing(true);
    const worker = await createWorker("eng");

    let allPalletIds = [];

    for (const file of acceptedFiles) {
      if (file.type === "application/pdf") {
        // Process PDF using pdf.js
        const pdf = await pdfjsLib.getDocument(URL.createObjectURL(file)).promise;
        for (let i = 0; i < pdf.numPages; i++) {
          const page = await pdf.getPage(i + 1);
          const viewport = page.getViewport({ scale: 2.0 });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          await page.render({ canvasContext: context, viewport }).promise;

          // OCR this page
          const {
            data: { text },
          } = await worker.recognize(canvas);
          allPalletIds.push(...extractPalletIds(text));
        }
      } else if (file.type.startsWith("image/")) {
        // OCR image files
        const {
          data: { text },
        } = await worker.recognize(file);
        allPalletIds.push(...extractPalletIds(text));
      }
    }

    await worker.terminate();

    // Remove duplicates
    allPalletIds = [...new Set(allPalletIds)];

    setResults(allPalletIds);
    setProcessing(false);

    // Save results to Supabase
    if (allPalletIds.length > 0) {
      await supabase.from("pallet_ids").insert(
        allPalletIds.map((id) => ({ pallet_id: id }))
      );
    }
  }, []);

  const { getRootProps, getInputProps } = useDropzone({ onDrop });

  return (
    <div className="p-6">
      <div
        {...getRootProps()}
        className="border-2 border-dashed p-10 text-center cursor-pointer"
      >
        <input {...getInputProps()} />
        <p>Drop PDF or image files here to extract pallet IDs</p>
      </div>

      {processing && <p className="mt-4">Processing...</p>}

      {!processing && results.length > 0 && (
        <div className="mt-4">
          <h2 className="font-bold">Extracted Pallet IDs:</h2>
          <ul>
            {results.map((id, idx) => (
              <li key={idx}>{id}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default App;
