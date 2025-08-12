import React, { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";

// Load libraries from CDN to avoid npm installs
import "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.4.120/build/pdf.min.js";
import "https://cdn.jsdelivr.net/npm/tesseract.js@5.0.3/dist/tesseract.min.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.7/+esm";

// Supabase client from CDN
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export default function App() {
  const [status, setStatus] = useState("");
  const [palletIds, setPalletIds] = useState([]);

  const processFile = async (file) => {
    setStatus("Processing file...");
    try {
      const fileType = file.type;
      let text = "";

      if (fileType === "application/pdf") {
        text = await processPDF(file);
      } else if (fileType.startsWith("image/")) {
        text = await runOCR(file);
      } else {
        throw new Error("Unsupported file type");
      }

      const ids = extractPalletIds(text);
      setPalletIds(ids);

      if (ids.length > 0) {
        const fileName = file.name;

        await supabase.from("NDAs").insert(
          ids.map((id, idx) => ({
            pallet_id: id,
            document_name: fileName,
            page_number: idx + 1,
          }))
        );

        setStatus("Upload complete and saved to Supabase!");
      } else {
        setStatus("No pallet IDs found.");
      }
    } catch (error) {
      console.error(error);
      setStatus(`Error: ${error.message}`);
    }
  };

  const processPDF = async (file) => {
    setStatus("Extracting text from PDF...");
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = "";

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({ canvasContext: context, viewport }).promise;

      const imgBlob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/png")
      );
      const ocrResult = await runOCR(imgBlob);
      text += ocrResult + "\n";
    }
    return text;
  };

  const runOCR = async (file) => {
    setStatus("Running OCR...");
    const { data } = await window.Tesseract.recognize(file, "eng", {
      logger: (m) => console.log(m),
    });
    return data.text;
  };

  const extractPalletIds = (text) => {
    const regex = /\b[A-Z0-9]{8,}\b/g;
    return text.match(regex) || [];
  };

  const onDrop = useCallback((acceptedFiles) => {
    if (acceptedFiles.length > 0) {
      processFile(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "image/*": [".png", ".jpg", ".jpeg"],
    },
  });

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Pallet ID Extractor</h1>
      <div
        {...getRootProps()}
        className={`p-6 border-2 border-dashed rounded-lg text-center ${
          isDragActive ? "bg-blue-50" : ""
        }`}
      >
        <input {...getInputProps()} />
        {isDragActive ? (
          <p>Drop the file here...</p>
        ) : (
          <p>Drag & drop a PDF or image, or click to select</p>
        )}
      </div>
      <p className="mt-4">{status}</p>
      {palletIds.length > 0 && (
        <div className="mt-4">
          <h2 className="font-bold">Extracted Pallet IDs:</h2>
          <ul className="list-disc list-inside">
            {palletIds.map((id, idx) => (
              <li key={idx}>{id}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
