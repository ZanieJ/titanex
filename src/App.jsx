import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import * as pdfjsLib from 'pdfjs-dist'

// Set worker for pdfjs
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

export default function App() {
  const [palletInput, setPalletInput] = useState('')
  const [results, setResults] = useState({})
  const [loading, setLoading] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)

  const extractFromPDF = async (file) => {
    setPdfLoading(true)
    try {
      const arrayBuffer = await file.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

      let textContent = ''
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const text = await page.getTextContent()
        const pageText = text.items.map((item) => item.str).join(' ')
        textContent += ' ' + pageText
      }

      const ids = [...new Set(textContent.match(/\b\d{18}\b/g) || [])]
      setPalletInput(ids.join('\n'))
    } catch (err) {
      alert('PDF extraction failed: ' + err.message)
    } finally {
      setPdfLoading(false)
    }
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file && file.type === 'application/pdf') {
      extractFromPDF(file)
    } else {
      alert('Please upload a valid PDF file.')
    }
  }

  const handleLookup = async () => {
    const palletIds = palletInput
      .split('\n')
      .map((id) => id.trim())
      .filter(Boolean)

    if (!palletIds.length) return

    setLoading(true)
    const resultsMap = {}

    for (const id of palletIds) {
      const { data, error } = await supabase
        .from('NDAs')
        .select('document_name, page_number')
        .eq('pallet_id', id)

      resultsMap[id] = error ? { error: error.message } : data
    }

    setResults(resultsMap)
    setLoading(false)
  }

  const handleUploadToSupabase = async () => {
    const palletIds = palletInput
      .split('\n')
      .map((id) => ({ pallet_id: id }))
      .filter((row) => row.pallet_id)

    if (!palletIds.length) return

    const { error } = await supabase.from('NDAs').insert(palletIds)
    if (error) {
      alert('Upload failed: ' + error.message)
    } else {
      alert('Uploaded successfully!')
    }
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <h2>Pallet ID NDA Lookup</h2>

      <input
        type="file"
        accept="application/pdf"
        onChange={handleFileChange}
        style={{ marginBottom: '1rem', display: 'block' }}
      />

      {pdfLoading && (
        <div style={{ marginBottom: '1rem' }}>
          Extracting pallet IDs from PDF...
        </div>
      )}

      <textarea
        rows={10}
        placeholder="Paste pallet IDs, one per line..."
        style={{ width: '100%', marginBottom: '1rem' }}
        value={palletInput}
        onChange={(e) => setPalletInput(e.target.value)}
      />
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button onClick={handleLookup} disabled={loading}>
          {loading ? 'Looking up...' : 'Lookup'}
        </button>
        <button onClick={handleUploadToSupabase}>
          Upload to Supabase
        </button>
      </div>

      <div style={{ marginTop: '2rem' }}>
        {Object.keys(results).map((id) => (
          <div key={id} style={{ marginBottom: '1rem' }}>
            <strong>{id}</strong>
            <ul>
              {results[id].error ? (
                <li style={{ color: 'red' }}>{results[id].error}</li>
              ) : results[id].length === 0 ? (
                <li style={{ color: 'red' }}>❌ No match found</li>
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
    </div>
  )
}
