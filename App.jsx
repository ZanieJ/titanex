import React, { useState } from "react";
import * as pdfjsLib from "pdfjs-dist/webpack";
import Tesseract from "tesseract.js";
import "./style.css";

export default function App() {
  const [fileName, setFileName] = useState("");
  const [palletIds, setPalletIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");

  const extractPalletIds = async (file) => {
    setLoading(true);
    setProgress("Loading PDF...");
    setPalletIds([]);

    const fileReader = new FileReader();
    fileReader.onload = async function () {
      const typedarray = new Uint8Array(this.result);
      const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;

      let foundIds = [];

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        setProgress(`Processing page ${pageNum} of ${pdf.numPages}...`);
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: context, viewport }).promise;

        const { data: { text } } = await Tesseract.recognize(canvas, "eng", {
          logger: (m) => {
            if (m.status === "recognizing text") {
              setProgress(`OCR Progress: ${(m.progress * 100).toFixed(1)}%`);
            }
          },
        });

        // Split into lines and trim
        const lines = text.split("\n").map(line => line.trim()).filter(Boolean);

        // Find heading index
        const headingIndex = lines.findIndex(line => /pallet\s*id/i.test(line));

        if (headingIndex !== -1) {
          for (let i = headingIndex + 1; i < lines.length; i++) {
            const match = lines[i].match(/\b\d{18}\b/);
            if (match) {
              foundIds.push(match[0]);
            } else {
              // stop if no match — end of column
              break;
            }
          }
        }
      }

      setPalletIds(foundIds);
      setProgress(foundIds.length ? `Found ${foundIds.length} pallet IDs` : "No pallet IDs found");
      setLoading(false);
    };

    fileReader.readAsArrayBuffer(file);
  };

  const handleFile = (file) => {
    if (file && file.type === "application/pdf") {
      setFileName(file.name);
      extractPalletIds(file);
    } else {
      alert("Please upload a PDF file.");
    }
  };

  return (
    <div className="app-container">
      <h1>Pallet ID Extractor</h1>
      <div
        className="upload-area"
        onDrop={(e) => {
          e.preventDefault();
          handleFile(e.dataTransfer.files[0]);
        }}
        onDragOver={(e) => e.preventDefault()}
      >
        <p>Drag & drop your PDF here, or click to select</p>
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => handleFile(e.target.files[0])}
        />
      </div>

      {fileName && <p><strong>{fileName}</strong></p>}
      {loading && <p>{progress}</p>}
      {!loading && palletIds.length > 0 && (
        <div className="results">
          <h3>Extracted Pallet IDs:</h3>
          <ul>
            {palletIds.map((id, idx) => (
              <li key={idx}>{id}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
