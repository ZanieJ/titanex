import React, { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { createWorker } from "tesseract.js";
import * as pdfjsLib from "pdfjs-dist/build/pdf.js";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.js?worker";
import { createClient } from "@supabase/supabase-js";

// Tell pdf.js where its worker is
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

// ✅ Your Supabase credentials
const supabaseUrl = "https://cassouhzovotgdhzsssqg.supabase.co";
const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhc3NvdWh6b3ZvdGdkaHpzc3FnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkxMTg5MjYsImV4cCI6MjA2NDY5NDkyNn0.dNg51Yn9aplsyAP9kvsEQOTHWb64edsAk5OqiynEZlk";
const supabase = createClient(supabaseUrl, supabaseKey);

export default function App() {
  const [extractedText, setExtractedText] = useState("");
  const [loading, setLoading] = useState(false);

  const processFile = async (file) => {
    setLoading(true);
    try {
      let text = "";

      if (file.type === "application/pdf") {
        const fileReader = new FileReader();
        fileReader.onload = async () => {
          const typedarray = new Uint8Array(fileReader.result);
          const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
          let fullText = "";

          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item) => item.str).join(" ");
            fullText += pageText + "\n";
          }

          setExtractedText(fullText);
          setLoading(false);
        };
        fileReader.readAsArrayBuffer(file);
      } else if (file.type.startsWith("image/")) {
        const worker = await createWorker("eng");
        const {
          data: { text: ocrText },
        } = await worker.recognize(file);
        await worker.terminate();
        text = ocrText;
        setExtractedText(text);
        setLoading(false);
      }

      // Upload file to Supabase
      const { error } = await supabase.storage
        .from("uploads")
        .upload(`${Date.now()}_${file.name}`, file);

      if (error) {
        console.error("Upload error:", error.message);
      }
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const onDrop = useCallback((acceptedFiles) => {
    if (acceptedFiles.length > 0) {
      processFile(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps } = useDropzone({ onDrop });

  return (
    <div style={{ padding: "20px" }}>
      <h1>File Text Extractor</h1>
      <div
        {...getRootProps()}
        style={{
          border: "2px dashed #ccc",
          padding: "20px",
          textAlign: "center",
        }}
      >
        <input {...getInputProps()} />
        <p>Drag & drop a PDF or image, or click to select</p>
      </div>
      {loading ? (
        <p>Processing...</p>
      ) : (
        extractedText && (
          <div>
            <h2>Extracted Text:</h2>
            <pre>{extractedText}</pre>
          </div>
        )
      )}
    </div>
  );
}
