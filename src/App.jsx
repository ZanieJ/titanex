import React, { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { createWorker } from "tesseract.js";
import * as pdfjsLib from "pdfjs-dist";
import { createClient } from "@supabase/supabase-js";

import pdfWorker from "pdfjs-dist/build/pdf.worker?worker";

pdfjsLib.GlobalWorkerOptions.workerPort = new pdfWorker();

const supabase = createClient(
  "https://cassouhzovotgdhzssqg.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhc3NvdWh6b3ZvdGdkaHpzc3FnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkxMTg5MjYsImV4cCI6MjA2NDY5NDkyNn0.dNg51Yn9aplsyAP9kvsEQOTHWb64edsAk5OqiynEZlk"
);

const App = () => {
  const [results, setResults] = useState([]);
  const [processing, setProcessing] = useState(false);

  const extractPalletIds = (text) => {
    const regex = /\b\d{18}\b/g;
    return [...text.matchAll(regex)].map((match) => match[0]);
  };

  const onDrop = useCallback(async (acceptedFiles) => {
    setProcessing(true);
    let finalResults = [];

    for (const file of acceptedFiles) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale: 2.0 });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          await page.render({ canvasContext: context, viewport }).promise;

          const worker = await createWorker("eng");
          const { data: { text } } = await worker.recognize(canvas);
          await worker.terminate();

          const ids = extractPalletIds(text);
          ids.forEach((id) => {
            finalResults.push({
              pallet_id: id,
              document_name: file.name,
              page_number: pageNum,
            });
          });
        }
      } catch (err) {
        alert("Failed processing PDF: " + err.message);
        console.error(err);
      }
    }

    setResults(finalResults);
    setProcessing(false);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { "application/pdf": [] } });

  const uploadToSupabase = async () => {
    const { error } = await supabase.from("NDAs").insert(results);
    if (error) {
      alert("Upload failed: " + error.message);
    } else {
      alert("Upload successful!");
    }
  };

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Melissa OCR Pallet ID Extractor</h1>

      <div
        {...getRootProps()}
        className={`border-4 border-dashed rounded-xl p-10 text-center transition ${
          isDragActive ? "border-blue-500 bg-blue-50" : "border-gray-300"
        }`}
      >
        <input {...getInputProps()} />
        {isDragActive ? (
          <p className="text-blue-500">Drop the PDFs here...</p>
        ) : (
          <p className="text-gray-600">Drag & drop PDF files here</p>
        )}
      </div>

      {processing && <p className="mt-4 text-yellow-600">Processing PDFs...</p>}

      {results.length > 0 && (
        <>
          <table className="table-auto w-full border mt-6 text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="border px-2 py-1">Pallet ID</th>
                <th className="border px-2 py-1">Document</th>
                <th className="border px-2 py-1">Page</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i}>
                  <td className="border px-2 py-1">{r.pallet_id}</td>
                  <td className="border px-2 py-1">{r.document_name}</td>
                  <td className="border px-2 py-1">{r.page_number}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            onClick={uploadToSupabase}
            className="mt-4 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          >
            Upload to Supabase
          </button>
        </>
      )}
    </div>
  );
};

export default App;