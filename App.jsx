import React, { useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import Tesseract from "tesseract.js";
import * as pdfjsLib from "pdfjs-dist";

// PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function App() {
  const [palletInput, setPalletInput] = useState("");
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(false);

  const extractTextFromPdf = async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item) => item.str).join(" ");
      fullText += "\n" + pageText;
    }
    return fullText;
  };

  const handleDrop = useCallback(async (event) => {
    event.preventDefault();
    const files = event.dataTransfer.files;

    if (files.length) {
      for (const file of files) {
        if (file.type.startsWith("image/")) {
          const { data: { text } } = await Tesseract.recognize(file, "eng");
          setPalletInput((prev) => prev + "\n" + text);
        } else if (file.type === "application/pdf") {
          const text = await extractTextFromPdf(file);
          setPalletInput((prev) => prev + "\n" + text);
        } else {
          alert("Only images and PDFs are supported.");
        }
      }
    }
  }, []);

  const handleLookup = async () => {
    const palletIds = palletInput
      .split("\n")
      .map((id) => id.trim())
      .filter(Boolean);

    if (!palletIds.length) return;

    setLoading(true);
    const resultsMap = {};

    for (const id of palletIds) {
      const { data, error } = await supabase
        .from("NDAs")
        .select("document_name, page_number")
        .eq("pallet_id", id);

      resultsMap[id] = error ? { error: error.message } : data;
    }

    setResults(resultsMap);
    setLoading(false);
  };

  return (
    <div
      style={{
        padding: "2rem",
        maxWidth: "800px",
        margin: "0 auto",
        textAlign: "center",
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <h2>Pallet ID NDA Lookup</h2>
      <p>Paste pallet IDs or drag & drop images/PDFs containing them.</p>
      <textarea
        rows={10}
        placeholder="Paste pallet IDs, one per line..."
        style={{ width: "100%", marginBottom: "1rem" }}
        value={palletInput}
        onChange={(e) => setPalletInput(e.target.value)}
      />
      <br />
      <button onClick={handleLookup} disabled={loading}>
        {loading ? "Looking up..." : "Lookup"}
      </button>

      <div style={{ marginTop: "2rem", textAlign: "left" }}>
        {Object.keys(results).map((id) => (
          <div key={id} style={{ marginBottom: "1rem" }}>
            <strong>{id}</strong>
            <ul>
              {results[id].error ? (
                <li style={{ color: "red" }}>{results[id].error}</li>
              ) : results[id].length === 0 ? (
                <li style={{ color: "red" }}>❌ No match found</li>
              ) : (
                results[id].map((entry, idx) => (
                  <li key={idx}>
                    📄 {entry.document_name} - 📄 Page {entry.page_number}
                  </li>
                ))
              )}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
