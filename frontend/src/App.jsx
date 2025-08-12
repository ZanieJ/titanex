import React, { useCallback, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useDropzone } from "react-dropzone";

// Supabase config
const SUPABASE_URL = "https://YOUR_PROJECT_ID.supabase.co";
const SUPABASE_KEY = "YOUR_ANON_KEY";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function App() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  const onDrop = useCallback(async (acceptedFiles) => {
    setLoading(true);
    const file = acceptedFiles[0];

    // Upload to Supabase storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("pdfs")
      .upload(`uploads/${file.name}`, file, { upsert: true });

    if (uploadError) {
      console.error(uploadError);
      setLoading(false);
      return;
    }

    console.log("Uploaded to Supabase:", uploadData);

    // Process PDF in browser with pdf.js (from CDN)
    const pdfjsLib = await import(
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.js"
    );
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.js";

    const fileReader = new FileReader();
    fileReader.onload = async function () {
      const typedArray = new Uint8Array(this.result);
      const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;

      let extractedText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        extractedText += textContent.items.map((item) => item.str).join(" ") + "\n";
      }
      setText(extractedText);
    };
    fileReader.readAsArrayBuffer(file);

    setLoading(false);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  return (
    <div style={{ padding: "2rem", fontFamily: "Arial" }}>
      <h1>Pallet ID Extractor</h1>
      <div
        {...getRootProps()}
        style={{
          border: "2px dashed gray",
          padding: "2rem",
          textAlign: "center",
          background: isDragActive ? "#eee" : "#fafafa",
          cursor: "pointer"
        }}
      >
        <input {...getInputProps()} />
        {isDragActive ? <p>Drop the PDF here ...</p> : <p>Drag & drop a PDF, or click to select</p>}
      </div>
      {loading && <p>Processing...</p>}
      {text && (
        <div style={{ marginTop: "2rem" }}>
          <h2>Extracted Text</h2>
          <pre>{text}</pre>
        </div>
      )}
    </div>
  );
}

export default App;
