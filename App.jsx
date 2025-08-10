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
  const [palletIds, setPalletIds] = useState([]);
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  const extractTextFromPdf = async (file) => {
    try {
      setStatusMsg(`Extracting text from PDF: ${file.name}...`);
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = "";

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item) => item.str).join(" ");
        fullText += "\n" + pageText;
      }

      setStatusMsg("PDF text extraction complete.");
      return fullText;
    } catch (err) {
      console.error("PDF extraction error:", err);
      setStatusMsg("❌ Failed to read PDF.");
      return "";
    }
  };

  const extractPalletIds = (text) => {
    // Adjust regex depending on pallet ID format
    const ids = text.match(/[A-Z0-9]{6,}/g) || [];
    const uniqueIds = [...new Set(ids)];
    setPalletIds(uniqueIds);
    setStatusMsg(`✅ Found ${uniqueIds.length} pallet IDs.`);
  };

  const handleDrop = useCallback(async (event) => {
    event.preventDefault();
    const files = event.dataTransfer.files;

    if (files.length) {
      for (const file of files) {
        let text = "";

        if (file.type.startsWith("image/")) {
          setStatusMsg(`Extracting text from image: ${file.name}...`);
          const { data: { text: ocrText } } = await Tesseract.recognize(file, "eng");
          text = ocrText;
        } else if (file.type === "application/pdf") {
          text = await extractTextFromPdf(file);
        } else {
          alert("Only images and PDFs are supported.");
          return;
        }

        if (text.trim()) {
          extractPalletIds(text);
        } else {
          setStatusMsg("⚠ No text found in file.");
        }
      }
    }
  }, []);

  const pushToSupabase = async () => {
    if (!palletIds.length) {
      setStatusMsg("⚠ No pallet IDs to push.");
      return;
    }

    setLoading(true);
    setStatusMsg("Pushing pallet IDs to Supabase...");
    const resultsMap = {};

    for (const id of palletIds) {
      const { data, error } = await supabase
        .from("NDAs")
        .select("document_name, page_number")
        .eq("pallet_id", id);

      resultsMap[id] = error ? { error: error.message } : data;
    }

    setResults(resultsMap);
    setStatusMsg("✅ Supabase lookup complete.");
    setLoading(false);
  };

  return (
    <div
      style={{
        padding: "2rem",
        maxWidth: "800px",
        margin: "0 auto",
        textAlign: "center",
        border: "2px dashed #ccc",
        borderRadius: "10px",
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <h2>Pallet ID Extractor</h2>
      <p>Drop images or PDFs here. IDs will be extracted automatically.</p>
      {statusMsg && <p><strong>{statusMsg}</strong></p>}

      {palletIds.length > 0 && (
        <>
          <h3>Extracted Pallet IDs</h3>
          <textarea
            rows={6}
            style={{ width: "100%" }}
            value={palletIds.join("\n")}
            readOnly
          />
          <br />
          <button onClick={pushToSupabase} disabled={loading}>
            {loading ? "Pushing..." : "Push to Supabase"}
          </button>
        </>
      )}

      {Object.keys(results).length > 0 && (
        <div style={{ marginTop: "2rem", textAlign: "left" }}>
          <h3>Supabase Results</h3>
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
      )}
    </div>
  );
}
