import React, { useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import Tesseract from "tesseract.js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function App() {
  const [palletInput, setPalletInput] = useState("");
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(false);

  const handleDrop = useCallback((event) => {
    event.preventDefault();
    const files = event.dataTransfer.files;

    if (files.length) {
      for (const file of files) {
        if (file.type.startsWith("image/")) {
          Tesseract.recognize(file, "eng").then(({ data: { text } }) => {
            setPalletInput((prev) => prev + "\n" + text);
          });
        } else {
          alert("Only image files are supported for drag & drop.");
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
      <p>Paste pallet IDs or drag & drop an image containing them.</p>
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
