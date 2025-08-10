import React, { useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { createWorker } from "tesseract.js";
import { createClient } from "@supabase/supabase-js";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function App() {
  const [status, setStatus] = useState("");
  const [palletIds, setPalletIds] = useState([]);

  async function handleDrop(e) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file || file.type !== "application/pdf") {
      alert("Please drop a PDF file.");
      return;
    }
    setStatus("Extracting pallet IDs...");
    setPalletIds([]);

    try {
      const ids = await extractPalletIdsFromPDF(file);
      setPalletIds(ids);
      setStatus(ids.length ? `Found ${ids.length} pallet IDs` : "No pallet IDs found.");
    } catch (err) {
      console.error(err);
      setStatus("Error extracting pallet IDs.");
    }
  }

  async function extractPalletIdsFromPDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const worker = await createWorker("eng");

    const ids = new Set();

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      setStatus(`Processing page ${pageNum} of ${pdf.numPages}...`);

      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 3.0 }); // higher resolution
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      await page.render({ canvasContext: context, viewport }).promise;

      // Preprocess for better OCR
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = imageData.data;
      for (let i = 0; i < pixels.length; i += 4) {
        const avg = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
        const bw = avg > 180 ? 255 : 0;
        pixels[i] = bw;
        pixels[i + 1] = bw;
        pixels[i + 2] = bw;
      }
      context.putImageData(imageData, 0, 0);

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));

      const {
        data: { text },
      } = await worker.recognize(blob, {
        tessedit_char_whitelist: "0123456789OolI- ",
      });

      const cleanedText = text
        .replace(/[Oo]/g, "0")
        .replace(/[lI]/g, "1")
        .replace(/[^0-9]/g, " ");

      // Match sequences that could be 18-digit IDs, allowing spaces
      const matches = cleanedText.match(/(?:\d\s*){18,18}/g);
      if (matches) {
        matches.forEach((m) => {
          const pure = m.replace(/\s+/g, "");
          if (pure.length === 18) ids.add(pure);
        });
      }
    }

    await worker.terminate();
    return Array.from(ids);
  }

  async function pushToSupabase() {
    if (!palletIds.length) return;
    const { error } = await supabase
      .from("pallets")
      .insert(palletIds.map((id) => ({ pallet_id: id })));
    if (error) alert(`Error: ${error.message}`);
    else alert("Pallet IDs pushed to Supabase!");
  }

  return (
    <div>
      <h1>Pallet ID Extractor</h1>
      <div
        id="drop-zone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        style={{
          border: "3px dashed #666",
          padding: "40px",
          width: "300px",
          margin: "20px auto",
          cursor: "pointer",
        }}
      >
        Drop PDF here
      </div>
      <p>{status}</p>
      <ul>
        {palletIds.map((id) => (
          <li key={id}>{id}</li>
        ))}
      </ul>
      {palletIds.length > 0 && (
        <button onClick={pushToSupabase}>Push to Supabase</button>
      )}
    </div>
  );
}
