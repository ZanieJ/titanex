import React, { useState, useRef, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf'
import { createWorker } from 'tesseract.js'
import { createClient } from '@supabase/supabase-js'

// Set up pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.js',
  import.meta.url
).toString()

// Supabase setup
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

export default function App() {
  const [processing, setProcessing] = useState(false)
  const [status, setStatus] = useState('')
  const [results, setResults] = useState([])
  const fileRef = useRef(null)

  // Extract text from PDF using pdf.js + Tesseract.js
  const handleFile = useCallback(async (file) => {
    if (!file) return
    if (file.type !== 'application/pdf') {
      setStatus('❌ Please select a PDF file.')
      return
    }

    setProcessing(true)
    setStatus('📄 Reading PDF...')

    try {
      const pdfData = new Uint8Array(await file.arrayBuffer())
      const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise
      const worker = await createWorker('eng')

      let allText = ''
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        setStatus(`🔍 Processing page ${pageNum} of ${pdf.numPages}...`)
        const page = await pdf.getPage(pageNum)
        const viewport = page.getViewport({ scale: 2 })
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')
        canvas.height = viewport.height
        canvas.width = viewport.width
        await page.render({ canvasContext: context, viewport }).promise

        const {
          data: { text },
        } = await worker.recognize(canvas)
        allText += text + '\n'
      }

      await worker.terminate()

      // Extract pallet IDs (example: lines starting with PAL)
      const palletIds = allText
        .split(/\s+/)
        .filter((word) => /^[A-Za-z0-9-]+$/.test(word))

      setStatus(`📦 Found ${palletIds.length} possible IDs. Looking up in Supabase...`)

      const resultsMap = []
      for (const id of palletIds) {
        const { data, error } = await supabase
          .from('NDAs')
          .select('document_name, page_number')
          .eq('pallet_id', id)

        resultsMap.push({
          id,
          data: error ? { error: error.message } : data,
        })
      }

      setResults(resultsMap)
      setStatus('✅ Done!')
    } catch (err) {
      console.error(err)
      setStatus(`❌ Error: ${err.message}`)
    } finally {
      setProcessing(false)
    }
  }, [])

  // Drag-and-drop handlers
  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
  }

  return (
    <div
      className="drop-zone"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      style={{
        border: '2px dashed #aaa',
        padding: '2rem',
        textAlign: 'center',
        background: '#fafafa',
        minHeight: '100vh',
      }}
    >
      <div className="container" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <h1>📦 Pallet ID Extractor</h1>

        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          style={{ display: 'none' }}
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={processing}
          style={{ padding: '0.5rem 1rem', fontSize: '1rem' }}
        >
          Choose PDF
        </button>
        <div style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#666' }}>
          or drag and drop your PDF here
        </div>

        <div style={{ marginTop: '1rem', fontStyle: 'italic' }}>{status}</div>

        <div style={{ marginTop: '2rem', textAlign: 'left' }}>
          {results.map(({ id, data }, idx) => (
            <div key={idx} style={{ marginBottom: '1rem' }}>
              <strong>{id}</strong>
              <ul>
                {data.error ? (
                  <li style={{ color: 'red' }}>{data.error}</li>
                ) : data.length === 0 ? (
                  <li style={{ color: 'red' }}>❌ No match found</li>
                ) : (
                  data.map((entry, eIdx) => (
                    <li key={eIdx}>
                      📄 {entry.document_name} – Page {entry.page_number}
                    </li>
                  ))
                )}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
