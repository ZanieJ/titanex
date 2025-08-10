import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs";
import "./style.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

function App() {
  const [palletIDs, setPalletIDs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setError("");
    setLoading(true);
    setPalletIDs([]);

    try {
      const fileReader = new FileReader();
      fileReader.onload = async function () {
        const typedArray = new Uint8Array(this.result);
        const pdf = await pdfjsLib.getDocument(typedArray).promise;

        let foundIDs = [];

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const textContent = await page.getTextContent();
          const strings = textContent.items.map((item) => item.str);

          // Find "Pallet ID" header and grab values below it
          const headerIndex = strings.findIndex(
            (text) => text.trim().toLowerCase() === "pallet id"
          );

          if (headerIndex !== -1) {
            for (let i = headerIndex + 1; i < strings.length; i++) {
              const val = strings[i].trim();
              if (/^\d+$/.test(val)) {
                foundIDs.push(val);
              } else {
                // Stop if we hit the next header or unrelated text
                break;
              }
            }
          }
        }

        setPalletIDs(foundIDs);
        setLoading(false);
      };
      fileReader.readAsArrayBuffer(file);
    } catch (err) {
      console.error(err);
      setError("Failed to read PDF");
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <h1>Pallet ID Extractor</h1>
      <input type="file" accept="application/pdf" onChange={handleFileUpload} />
      {loading && <p>Processing PDF…</p>}
      {error && <p className="error">{error}</p>}
      {palletIDs.length > 0 && (
        <div className="results">
          <h2>Extracted Pallet IDs:</h2>
          <ul>
            {palletIDs.map((id, idx) => (
              <li key={idx}>{id}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
