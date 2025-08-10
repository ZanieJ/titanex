import React, { useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist/webpack";
import Tesseract from "tesseract.js";
import "./style.css";

export default function App() {
  const [fileName, setFileName] = useState("");
  const [palletIds, setPalletIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");

  const handleFiles = useCallback(async (files) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    setFileName(file.name);
    setPalletIds([]);
    setLoading(true);
    setProgress("Loading PDF...");

    const fileReader = new FileReader();
    fileReader.onload = async function () {
      try {
        const typedArray = new Uint8Array(this.result);
        const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;
        const ids = new Set();

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          setProgress(`Processing page ${pageNum} of ${pdf.numPages}...`);
          const page = await pdf.getPage(pageNum);

          const viewport = page.getViewport({ scale: 4.0 }); // higher resolution
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          await page.render({ canvasContext: context, viewport }).promise;

          const { data: { text } } = await Tesseract.recognize(
            canvas,
            "eng",
            {
              logger: (m) => {
                if (m.status === "recognizing text") {
                  setProgress(
                    `OCR ${Math.round(m.progress * 100)}% on page ${pageNum}`
                  );
                }
              },
            }
          );

          // Fix common OCR misreads
          let cleanedText = text
            .replace(/[Oo]/g, "0")
            .replace(/[lI]/g, "1");

          // Match 18-digit sequences
          const found = cleanedText.match(/\b\d{18}\b/g);
          if (found) {
            found.forEach((id) => ids.add(id));
          }
        }

        setPalletIds(Array.from(ids));
        setProgress(ids.size > 0 ? "Done" : "No pallet IDs found");
      } catch (err) {
        console.error(err);
        setProgress("Error processing file");
      } finally {
        setLoading(false);
      }
    };
    fileReader.readAsArrayBuffer(file);
  }, []);

  const handleDrop = (e) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleFileChange = (e) => {
    handleFiles(e.target.files);
  };

  return (
    <div className="container">
      <h1>Pallet ID Extractor</h1>

      <div
        className="drop-zone"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <p>Drag & Drop PDF here or click to upload</p>
        <input type="file" accept="application/pdf" onChange={handleFileChange} />
      </div>

      {fileName && <p className="file-name">{fileName}</p>}

      {loading && <p>{progress}</p>}

      {!loading && palletIds.length > 0 && (
        <div>
          <h3>Found {palletIds.length} pallet IDs</h3>
          <ul>
            {palletIds.map((id, idx) => (
              <li key={idx}>{id}</li>
            ))}
          </ul>
        </div>
      )}

      {!loading && palletIds.length === 0 && fileName && progress === "No pallet IDs found" && (
        <p>No pallet IDs found</p>
      )}
    </div>
  );
}
