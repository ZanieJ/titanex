import React, { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";

const App = () => {
  const [results, setResults] = useState([]);
  const [processing, setProcessing] = useState(false);

  const extractPalletIds = (text) => {
    const regex = /\b\d{14,18}\b/g;
    const matches = text.match(regex) || [];
    return matches;
  };

  const onDrop = useCallback(async (acceptedFiles) => {
    setProcessing(true);
    let finalResults = [];

    for (const file of acceptedFiles) {
      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("http://localhost:8000/extract", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();
        finalResults = [...finalResults, ...data.results];
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
    // Backend already inserts to Supabase if configured, but keeping a client-side hook if desired.
    alert("Upload to Supabase is handled server-side after extraction.")
  };

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Melissa OCR Pallet ID Extractor</h1>

      <div
        {...getRootProps()}
        className={`border-4 border-dashed rounded-xl p-10 text-center transition ${isDragActive ? "border-blue-500 bg-blue-50" : "border-gray-300"}`}
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
