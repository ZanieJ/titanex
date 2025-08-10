import React, { useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { createWorker } from "tesseract.js";

// Netlify-safe PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export default function App() {
  const [fileName, setFileName] = useState("");
  const [palletIds, setPalletIds] = useState([]);
  const [loading, setLoading] = useState(false);

  const extractFromPdf = useCallback(async (file) => {
    setLoading(true);
    setFileName(file.name);
    setPalletIds([]);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const worker = await createWorker("eng");

      let foundIds = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: ctx, viewport }).promise;

        const {
          data: { text },
        } = await worker.recognize(canvas);

        const matches = text.match(/\b\d{18}\b/g);
        if (matches) {
          foundIds.push(...matches);
        }
      }

      await worker.terminate();

      setPalletIds(foundIds.length > 0 ? foundIds : []);
    } catch (err) {
      console.error("Error processing PDF:", err);
    }
    setLoading(false);
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      if (e.dataTransfer.files.length) {
        extractFromPdf(e.dataTransfer.files[0]);
      }
    },
    [extractFromPdf]
  );

  const handleFileSelect = (e) => {
    if (e.target.files.length) {
      extractFromPdf(e.target.files[0]);
    }
  };

  return (
    <div
      style={{
        maxWidth: "600px",
        margin: "auto",
        padding: "20px",
        textAlign: "center",
        border: "2px dashed #ccc",
        borderRadius: "10px",
      }}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      <h1>Pallet ID Extractor</h1>
      <input
        type="file"
        accept="application/pdf"
        onChange={handleFileSelect}
        style={{ marginBottom: "20px" }}
      />
      {loading && <p>Processing… please wait</p>}
      {fileName && <h3>{fileName}</h3>}
      {palletIds.length > 0 ? (
        <>
          <h4>Found {palletIds.length} pallet IDs</h4>
          <ul style={{ textAlign: "left" }}>
            {palletIds.map((id, idx) => (
              <li key={idx}>{id}</li>
            ))}
          </ul>
        </>
      ) : (
        !loading && fileName && <p>No pallet IDs found</p>
      )}
    </div>
  );
}
