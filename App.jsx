import React, { useState } from "react";
import { createClient } from "@supabase/supabase-js";

// Get from environment (Netlify)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function App() {
  const [palletIds, setPalletIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pushStatus, setPushStatus] = useState("");

  const extractTextFromPDF = async (file) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = "";

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item) => item.str).join(" ");
        fullText += "\n" + pageText;
      }

      return fullText;
    } catch (err) {
      console.error("PDF extraction error:", err);
      return "";
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setLoading(true);
    setPalletIds([]);
    setPushStatus("");

    const file = e.dataTransfer.files[0];
    if (!file || !file.name.toLowerCase().endsWith(".pdf")) {
      alert("Please drop a PDF file.");
      setLoading(false);
      return;
    }

    const text = await extractTextFromPDF(file);

    // Extract exactly 18-digit IDs
    const ids = [...new Set(text.match(/\b\d{18}\b/g) || [])];

    if (ids.length === 0) {
      alert("No pallet IDs found in this file.");
    }

    setPalletIds(ids);
    setLoading(false);
  };

  const handlePushToSupabase = async () => {
    if (!palletIds.length) return;
    setPushStatus("Pushing...");

    try {
      const { data, error } = await supabase
        .from("NDAs")
        .insert(palletIds.map((id) => ({ pallet_id: id })));

      if (error) throw error;

      setPushStatus(`✅ Successfully pushed ${palletIds.length} IDs to Supabase`);
    } catch (err) {
      console.error(err);
      setPushStatus("❌ Error pushing to Supabase: " + err.message);
    }
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      style={{
        padding: "2rem",
        maxWidth: "800px",
        margin: "0 auto",
        textAlign: "center",
        border: "2px dashed #aaa",
        borderRadius: "8px",
        background: "#f9f9f9"
      }}
    >
      <h2>Pallet ID Extractor</h2>
      <p>Drop a PDF file here to extract pallet IDs (18 digits each)</p>

      {loading && <p>⏳ Extracting...</p>}

      {!loading && palletIds.length > 0 && (
        <div style={{ marginTop: "1rem", textAlign: "left" }}>
          <h3>Found IDs:</h3>
          <ul>
            {palletIds.map((id) => (
              <li key={id}>{id}</li>
            ))}
          </ul>
          <button onClick={handlePushToSupabase} style={{ marginTop: "1rem" }}>
            Push to Supabase
          </button>
          {pushStatus && <p>{pushStatus}</p>}
        </div>
      )}
    </div>
  );
}
