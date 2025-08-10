import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import Tesseract from "tesseract.js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function App() {
  const [palletInput, setPalletInput] = useState("");
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const extractPalletIds = (text) => {
    // Example regex — adjust for your pallet ID format
    const regex = /\b[A-Z0-9]{6,}\b/g;
    const matches = text.match(regex) || [];
    return Array.from(new Set(matches));
  };

  const runOCR = async (file) => {
    const { data } = await Tesseract.recognize(file, "eng");
    return extractPalletIds(data.text);
  };

  const handleLookup = async (ids) => {
    if (!ids.length) return;
    setLoading(true);
    const resultsMap = {};

    for (const id of ids) {
      const { data, error } = await supabase
        .from("NDAs")
        .select("document_name, page_number")
        .eq("pallet_id", id);

      resultsMap[id] = error ? { error: error.message } : data;
    }

    setResults(resultsMap);
    setLoading(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file || file.type !== "application/pdf") {
      alert("Please drop a PDF file.");
      return;
    }
    setLoading(true);
    const ids = await runOCR(file);
    setPalletInput(ids.join("\n"));
    await handleLookup(ids);
    setLoading(false);
  };

  return (
    <div style={{ padding: "2rem", maxWidth: "800px", margin: "0 auto" }}>
      <h2>Pallet ID NDA Lookup</h2>

      <div
        className={`dropzone ${dragOver ? "dragover" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {dragOver ? "Drop the PDF here" : "Drag & Drop PDF here"}
      </div>

      <textarea
        rows={10}
        placeholder="Paste pallet IDs, one per line..."
        style={{ width: "100%", marginBottom: "1rem" }}
        value={palletInput}
        onChange={(e) => setPalletInput(e.target.value)}
      />

      <button
        onClick={() =>
          handleLookup(
            palletInput
              .split("\n")
              .map((id) => id.trim())
              .filter(Boolean)
          )
        }
        disabled={loading}
      >
        {loading ? "Looking up..." : "Lookup"}
      </button>

      <div style={{ marginTop: "2rem" }}>
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
