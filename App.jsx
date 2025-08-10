import React, { useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { createWorker } from "tesseract.js";
import "pdfjs-dist/build/pdf.worker.entry";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.js",
  import.meta.url
).toString();

export default function App() {
  const [status, setStatus] = useState("");
  const [palletIds, setPalletIds] = useState([]);

  async function extractPalletIdsFromPDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const worker = await createWorker("eng");

    const ids = new Set();

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      setStatus(`Processing page ${pageNum} of ${pdf.numPages}...`);

      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 3.0 }); // higher scale = better OCR
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({ canvasContext: context, viewport }).promise;

      // OCR the image
      const { data: { text } } = await worker.recognize(canvas);
      console.log(`OCR text from page ${pageNum}:`, text);

      // Match possible pallet IDs (adjust as needed)
      const found = text.match(/[A-Z0-9\- ]{12,20}/gi);
      if (found) {
        found.forEach(raw => {
          const cleaned = raw.replace(/[^A-Z0-9]/gi, "");
          if (cleaned.length >= 12) ids.add(cleaned);
        });
      }
    }

    await worker.terminate();
    return Array.from(ids);
  }

  async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    setStatus("Extracting pallet IDs...");
    const ids = await extractPalletIdsFromPDF(file);

    if (ids.length > 0) {
      setPalletIds(ids);
      setStatus(`Found ${ids.length} pallet IDs`);
    } else {
      setPalletIds([]);
      setStatus("No pallet IDs found");
    }
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.heading}>Pallet ID Extractor</h1>
      <input
        type="file"
        accept="application/pdf"
        onChange={handleFileUpload}
        style={styles.fileInput}
      />
      <p>{status}</p>

      {palletIds.length > 0 && (
        <div style={styles.results}>
          <h2>Extracted Pallet IDs:</h2>
          <ul>
            {palletIds.map((id, index) => (
              <li key={index}>{id}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    fontFamily: "Arial, sans-serif",
    padding: "20px",
    textAlign: "center",
  },
  heading: {
    marginBottom: "20px",
  },
  fileInput: {
    margin: "10px 0",
  },
  results: {
    marginTop: "20px",
    textAlign: "left",
    display: "inline-block",
  },
};
