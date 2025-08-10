import React, { useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { createWorker } from "tesseract.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

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
    const worker = await createWorker();

    const ids = new Set();

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 3.0 });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      await page.render({ canvasContext: context, viewport }).promise;

      // PREPROCESSING: increase contrast, grayscale
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < imageData.data.length; i += 4) {
        const avg = (imageData.data[i] + imageData.data[i + 1] + imageData.data[i + 2]) / 3;
        const bw = avg > 180 ? 255 : 0; // threshold
        imageData.data[i] = bw;
        imageData.data[i + 1] = bw;
        imageData.data[i + 2] = bw;
      }
      context.putImageData(imageData, 0, 0);

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));

      const {
        data: { text }
      } = await worker.recognize(blob, "eng", {
        tessedit_char_whitelist: "0123456789"
      });

      // Flexible matching: allow spaces/dashes, then strip them
      const rawMatches = text.match(/[\d\s-]{18,}/g) || [];
      rawMatches.forEach((raw) => {
        const cleaned = raw.replace(/\D/g, ""); // keep only digits
        if (cleaned.length === 18) ids.add(cleaned);
      });
    }

    await worker.terminate();
    return Array.from(ids);
  }

  return (
    <div>
      <h1>Pallet ID Extractor</h1>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        style={{
          border: "3px dashed #666",
          padding: "40px",
          width: "300px",
          margin: "20px auto"
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
    </div>
  );
}
