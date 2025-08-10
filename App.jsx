import React, { useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function App() {
  const [palletIds, setPalletIds] = useState([]);
  const [statusMsg, setStatusMsg] = useState("");
  const [fileDropped, setFileDropped] = useState(false);

  const extractTextFromPdf = async (file) => {
    try {
      setStatusMsg(`Reading PDF: ${file.name}...`);
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = "";

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item) => item.str).join(" ");

        if (pageText.trim()) {
          fullText += "\n" + pageText;
        } else {
          setStatusMsg(`Running OCR on page ${i}...`);
          const viewport = page.getViewport({ scale: 2 });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          await page.render({ canvasContext: context, viewport }).promise;

          const { data: { text: ocrText } } = await Tesseract.recognize(canvas, "eng");
          fullText += "\n" + ocrText;
        }
      }

      setStatusMsg("✅ PDF text extraction complete.");
      return fullText;
    } catch (err) {
      console.error("PDF extraction error:", err);
      setStatusMsg("❌ Failed to read PDF.");
      return "";
    }
  };

  const extractTextFromImage = async (file) => {
    setStatusMsg(`Running OCR on image: ${file.name}...`);
    const { data: { text } } = await Tesseract.recognize(file, "eng");
    setStatusMsg("✅ Image OCR complete.");
    return text;
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setFileDropped(true);
    const file = e.dataTransfer.files[0];
    let extractedText = "";

    if (!file) return;

    if (file.type === "application/pdf") {
      extractedText = await extractTextFromPdf(file);
    } else if (file.type.startsWith("image/")) {
      extractedText = await extractTextFromImage(file);
    } else {
      setStatusMsg("❌ Unsupported file type.");
      return;
    }

    const ids = extractedText.match(/\b\d{10,}\b/g) || [];
    setPalletIds([...new Set(ids)]);
    if (ids.length === 0) {
      setStatusMsg("⚠ No pallet IDs found in file.");
    }
  };

  const handleSupabasePush = async () => {
    if (palletIds.length === 0) {
      setStatusMsg("⚠ No pallet IDs to push.");
      return;
    }

    setStatusMsg("📤 Pushing to Supabase...");
    const { data, error } = await supabase
      .from("NDAs")
      .insert(palletIds.map(id => ({ pallet_id: id })));

    if (error) {
      setStatusMsg(`❌ Supabase error: ${error.message}`);
    } else {
      setStatusMsg(`✅ Successfully pushed ${palletIds.length} IDs.`);
    }
  };

  return (
    <div>
      <div
        id="dropzone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        Drop PDF or image here
      </div>

      <textarea
        value={palletIds.join("\n")}
        readOnly
        placeholder="Extracted pallet IDs will appear here..."
      />

      {fileDropped && (
        <button onClick={handleSupabasePush}>Push to Supabase</button>
      )}

      <div className="status">{statusMsg}</div>
    </div>
  );
}
