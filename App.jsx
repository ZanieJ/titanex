import React, { useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import "pdfjs-dist/build/pdf.worker.entry";
import { createWorker } from "tesseract.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.js",
  import.meta.url
).toString();

export default function App() {
  const [fileName, setFileName] = useState("");
  const [palletIds, setPalletIds] = useState([]);
  const [loading, setLoading] = useState(false);

  const preprocessCanvas = (originalCanvas) => {
    const tempCanvas = document.createElement("canvas");
    const ctx = tempCanvas.getContext("2d");

    tempCanvas.width = originalCanvas.width;
    tempCanvas.height = originalCanvas.height;

    ctx.drawImage(originalCanvas, 0, 0);

    const imageData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    const data = imageData.data;

    // Convert to grayscale + threshold
    for (let i = 0; i < data.length; i += 4) {
      const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
      const val = avg > 150 ? 255 : 0;
      data[i] = data[i + 1] = data[i + 2] = val;
    }

    ctx.putImageData(imageData, 0, 0);
    return tempCanvas;
  };

  const extractPalletIdsFromText = (text) => {
    const regex = /\b\d{18}\b/g; // match exactly 18 consecutive digits
    const matches = text.match(regex);
    return matches ? Array.from(new Set(matches)) : [];
  };

  const handleFile = useCallback(async (file) => {
    setFileName(file.name);
    setPalletIds([]);
    setLoading(true);

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const worker = await createWorker("eng"); // no loadLanguage / initialize (deprecated)

    let allText = "";

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2 });

      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({ canvasContext: context, viewport }).promise;

      const processedCanvas = preprocessCanvas(canvas);
      const { data: { text } } = await worker.recognize(processedCanvas);

      allText += "\n" + text;
    }

    await worker.terminate();

    const ids = extractPalletIdsFromText(allText);
    setPalletIds(ids);
    setLoading(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type === "application/pdf") {
      handleFile(file);
    }
  }, [handleFile]);

  const handleFileSelect = useCallback((e) => {
    const file = e.target.files[0];
    if (file && file.type === "application/pdf") {
      handleFile(file);
    }
  }, [handleFile]);

  const handleDragOver = (e) => e.preventDefault();

  const pushToSupabase = () => {
    console.log("Pushing to Supabase:", palletIds);
    alert(`Pushed ${palletIds.length} IDs to Supabase (demo).`);
  };

  return (
    <div style={{ fontFamily: "sans-serif", padding: "20px" }}>
      <h1>Pallet ID Extractor</h1>

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        style={{
          border: "2px dashed #ccc",
          padding: "30px",
          textAlign: "center",
          marginBottom: "20px",
        }}
      >
        Drag & Drop PDF Here
        <br />
        or
        <br />
        <input type="file" accept="application/pdf" onChange={handleFileSelect} />
      </div>

      {loading && <p>Extracting pallet IDs...</p>}
      {fileName && <p><strong>{fileName}</strong></p>}

      {palletIds.length > 0 && (
        <>
          <p>Found {palletIds.length} pallet IDs:</p>
          <ul>
            {palletIds.map((id, idx) => (
              <li key={idx}>{id}</li>
            ))}
          </ul>
          <button onClick={pushToSupabase}>Push to Supabase</button>
        </>
      )}

      {!loading && fileName && palletIds.length === 0 && (
        <p>No pallet IDs found.</p>
      )}
    </div>
  );
}
