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

// === Preprocess an HTMLCanvasElement for OCR ===
const preprocessImage = (canvas) => {
  const ctx = canvas.getContext("2d");
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    // Convert to grayscale
    const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
    // Apply binary threshold (tweak threshold value if needed)
    const value = avg > 180 ? 255 : 0;
    data[i] = data[i + 1] = data[i + 2] = value; // R=G=B
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
};

// === Extract exactly 18-digit pallet IDs from text ===
const extractPalletIds = (text) => {
  const regex = /\b\d{18}\b/g;
  return [...text.matchAll(regex)].map((match) => match[0]);
};

const App = () => {
  const [results, setResults] = useState([]);
  const [processing, setProcessing] = useState(false);

  const onDrop = useCallback(async (acceptedFiles) => {
    setProcessing(true);
    const worker = await createWorker("eng");

    let allPalletIds = [];

    for (const file of acceptedFiles) {
      if (file.type === "application/pdf") {
        // Load and process each page of the PDF
        const pdf = await pdfjsLib.getDocument(URL.createObjectURL(file)).promise;
        for (let i = 0; i < pdf.numPages; i++) {
          const page = await pdf.getPage(i + 1);
          const viewport = page.getViewport({ scale: 3.0 }); // High DPI render
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          await page.render({ canvasContext: context, viewport }).promise;

          // Preprocess page image before OCR
          const processedCanvas = preprocessImage(canvas);

          const {
            data: { text },
          } = await worker.recognize(processedCanvas, {
            tessedit_char_whitelist: "0123456789",
            psm: 6,
          });

          allPalletIds.push(...extractPalletIds(text));
        }
      } else if (file.type.startsWith("image/")) {
        // OCR for images
        const img = document.createElement("img");
        img.src = URL.createObjectURL(file);
        await new Promise((resolve) => (img.onload = resolve));

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const processedCanvas = preprocessImage(canvas);

        const {
          data: { text },
        } = await worker.recognize(processedCanvas, {
          tessedit_char_whitelist: "0123456789",
          psm: 6,
        });

        allPalletIds.push(...extractPalletIds(text));
      }
    }

    await worker.terminate();

    // Remove duplicates
    allPalletIds = [...new Set(allPalletIds)];

    setResults(allPalletIds);
    setProcessing(false);

    // Save to Supabase
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
