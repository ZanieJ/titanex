import React, { useState, useCallback } from "react";
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
  const [fileName, setFileName] = useState("");

  const extractPalletIdsFromPDF = useCallback(async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const worker = await createWorker("eng");

    const ids = new Set();

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      setStatus(`Processing page ${pageNum} of ${pdf.numPages}...`);

      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 3.0 }); // better OCR resolution
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({ canvasContext: context, viewport }).promise;

      const { data: { text } } = await worker.recognize(canvas);
      console.log(`OCR text page ${pageNum}:`, text);

      // match exactly 18 consecutive digits
      const found = text.match(/\b\d{18}\b/g);
      if (found) {
        found.forEach(id => ids.add(id));
      }
    }

    await worker.terminate();
    return Array.from(ids);
  }, []);

  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const file = e.dataTransfer.files[0];
    if (!file || file.type !== "application/pdf") {
      setStatus("Please drop a valid PDF file.");
      return;
    }

    setFileName(file.name);
    setStatus("Extracting pallet IDs...");
    const ids = await extractPalletIdsFromPDF(file);

    if (ids.length > 0) {
      setPalletIds(ids);
      setStatus(`Found ${ids.length} pallet IDs`);
    } else {
      setPalletIds([]);
      setStatus("No pallet IDs found");
    }
  }, [extractPalletIdsFromPDF]);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.heading}>Pallet ID Extractor</h1>

      <div
        style={styles.dropZone}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {fileName
          ? <p>{fileName}</p>
          : <p>Drag & drop your PDF here</p>}
      </div>

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
  dropZone: {
    border: "2px dashed #ccc",
    borderRadius: "10px",
    padding: "40px",
    width: "80%",
    margin: "0 auto",
    backgroundColor: "#f9f9f9",
    cursor: "pointer",
  },
  results: {
    marginTop: "20px",
    textAlign: "left",
    display: "inline-block",
  },
};
