import React, { useState } from "react";

export default function App() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    setText("");

    const reader = new FileReader();
    reader.onload = async function () {
      try {
        // Using the pdfjsLib from CDN (already loaded globally)
        const pdf = await window.pdfjsLib.getDocument({ data: reader.result }).promise;
        let fullText = "";

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const content = await page.getTextContent();
          const strings = content.items.map((item) => item.str);
          fullText += strings.join(" ") + "\n";
        }

        setText(fullText);
      } catch (err) {
        console.error("Error reading PDF:", err);
        setText("Failed to read PDF.");
      } finally {
        setLoading(false);
      }
    };

    reader.readAsArrayBuffer(file);
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>PDF Text Extractor</h1>
      <input type="file" accept="application/pdf" onChange={handleFileChange} />
      {loading && <p>Loading...</p>}
      <pre
        style={{
          whiteSpace: "pre-wrap",
          background: "#f4f4f4",
          padding: "10px",
          marginTop: "20px",
        }}
      >
        {text}
      </pre>
    </div>
  );
}
