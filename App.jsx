import { useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import * as pdfjsLib from "pdfjs-dist";
import Tesseract from "tesseract.js";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function App() {
  const [palletIds, setPalletIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pushing, setPushing] = useState(false);

  const extractFromPDF = async (file) => {
    setLoading(true);
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let foundIds = new Set();

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({ canvasContext: context, viewport }).promise;

      const { data: { text } } = await Tesseract.recognize(canvas, "eng");

      const matches = text.match(/\b\d{18}\b/g);
      if (matches) {
        matches.forEach((id) => foundIds.add(id));
      }
    }

    setPalletIds([...foundIds]);
    setLoading(false);
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type === "application/pdf") {
      extractFromPDF(file);
    } else {
      alert("Please drop a PDF file.");
    }
  }, []);

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const pushToSupabase = async () => {
    if (palletIds.length === 0) return;
    setPushing(true);

    for (const id of palletIds) {
      await supabase.from("NDAs").insert({ pallet_id: id });
    }

    setPushing(false);
    alert("Data pushed to Supabase!");
  };

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "2rem" }}>
      <h2>Pallet ID Extractor</h2>
      <div
        className="dropzone"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {loading ? "Extracting pallet IDs..." : "Drop your PDF here"}
      </div>

      {palletIds.length > 0 && (
        <div className="results">
          <h3>Extracted Pallet IDs</h3>
          <ul>
            {palletIds.map((id) => (
              <li key={id}>{id}</li>
            ))}
          </ul>
          <button onClick={pushToSupabase} disabled={pushing}>
            {pushing ? "Pushing..." : "Push to Supabase"}
          </button>
        </div>
      )}
    </div>
  );
}
