import React, { useEffect, useState } from 'react';
import Dropzone from 'react-dropzone';

export default function App() {
  const [pdfjsLib, setPdfjsLib] = useState(null);
  const [textContent, setTextContent] = useState('');

  // Load pdf.js and configure worker
  useEffect(() => {
    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      setPdfjsLib(window.pdfjsLib);
    }
  }, []);

  // Extract text from first page of uploaded PDF
  const handlePDF = async (file) => {
    if (!pdfjsLib) {
      alert('PDF.js not loaded yet.');
      return;
    }

    const fileReader = new FileReader();
    fileReader.onload = async () => {
      const typedArray = new Uint8Array(fileReader.result);
      const pdf = await pdfjsLib.getDocument(typedArray).promise;
      const page = await pdf.getPage(1);
      const text = await page.getTextContent();
      const extractedText = text.items.map((item) => item.str).join(' ');
      setTextContent(extractedText);
    };
    fileReader.readAsArrayBuffer(file);
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial' }}>
      <h1>Pallet ID Extractor</h1>

      <Dropzone
        accept={{ 'application/pdf': [] }}
        onDrop={(acceptedFiles) => {
          if (acceptedFiles.length > 0) {
            handlePDF(acceptedFiles[0]);
          }
        }}
      >
        {({ getRootProps, getInputProps }) => (
          <div
            {...getRootProps()}
            style={{
              border: '2px dashed #666',
              padding: '20px',
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            <input {...getInputProps()} />
            <p>Drop PDF here or click to upload</p>
          </div>
        )}
      </Dropzone>

      {textContent && (
        <div style={{ marginTop: '20px' }}>
          <h3>Extracted Text:</h3>
          <pre style={{ background: '#f0f0f0', padding: '10px' }}>{textContent}</pre>
        </div>
      )}
    </div>
  );
}
