import React, { useState, useRef } from 'react'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf'
import { createWorker } from 'tesseract.js'
import { createClient } from '@supabase/supabase-js'

// Configure pdf worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.js',
  import.meta.url
).toString()

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

export default function App() {
  const [processing, setProcessing] = useState(false)
  const [status, setStatus] = useState('')
  const [results, setResults] = useState([]) // {palletId, page, documentName}
  const fileRef = useRef(null)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setResults([])
    setStatus('Reading PDF...')
    setProcessing(true)

    try {
      const arrayBuffer = await file.arrayBuffer()
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
      const pdf = await loadingTask.promise
      const numPages = pdf.numPages
      setStatus(`PDF loaded, ${numPages} pages — starting OCR in parallel...`)

      // helper to render a page to canvas and return image data (use data URL)
      async function renderPageToDataUrl(pageNumber) {
        const page = await pdf.getPage(pageNumber)
        const scale = 2.0 // scale for better OCR accuracy
        const viewport = page.getViewport({ scale })
        // create canvas
        let canvas
        let ctx
        if (typeof OffscreenCanvas !== 'undefined') {
          canvas = new OffscreenCanvas(viewport.width, viewport.height)
          ctx = canvas.getContext('2d')
        } else {
          canvas = document.createElement('canvas')
          canvas.width = Math.round(viewport.width)
          canvas.height = Math.round(viewport.height)
          ctx = canvas.getContext('2d')
        }

        const renderContext = {
          canvasContext: ctx,
          viewport
        }

        await page.render(renderContext).promise

        // convert offscreen canvas to blob/dataURL
        if (canvas.convertToBlob) {
          const blob = await canvas.convertToBlob()
          return URL.createObjectURL(blob)
        } else {
          return canvas.toDataURL('image/png')
        }
      }

      // For each page: produce image URL then OCR with tesseract.
      const pageNumbers = Array.from({ length: numPages }, (_, i) => i + 1)

      // Create a worker for each page, run in parallel:
      const ocrPromises = pageNumbers.map(async (pageNo, idx) => {
        setStatus(`Rendering page ${pageNo}...`)
        const dataUrl = await renderPageToDataUrl(pageNo)

        setStatus(`OCR page ${pageNo}...`)
        // spawn a worker per page (parallel)
        const worker = createWorker({
          logger: (m) => {
            // small progress updates (optional)
            // We won't spam UI but can log for debug
            // console.log('tesseract', pageNo, m)
          }
        })

        await worker.load()
        await worker.loadLanguage('eng')
        await worker.initialize('eng')
        // set page segmentation or OEM if you want:
        // await worker.setParameters({ tessedit_pageseg_mode: '3' })

        const { data } = await worker.recognize(dataUrl)
        await worker.terminate()

        // extract 18-digit numbers
        const text = data?.text || ''
        const matches = text.match(/\b\d{18}\b/g) || []
        // create result entries (dedupe on page)
        const uniqueMatches = Array.from(new Set(matches))
        return uniqueMatches.map((palletId) => ({
          palletId,
          page: pageNo,
          documentName: file.name
        }))
      })

      // Wait for all pages to be OCR'd
      const pagesResults = await Promise.all(ocrPromises)
      // flatten
      const flat = pagesResults.flat()
      // optionally dedupe globally (same palletID on multiple pages may be valid; we keep duplicates with their page)
      setResults(flat)
      setStatus(`OCR done. Found ${flat.length} pallet IDs.`)
    } catch (err) {
      console.error(err)
      setStatus('Error: ' + String(err))
    } finally {
      setProcessing(false)
    }
  }

  async function uploadToSupabase() {
    if (!results.length) return
    setStatus('Uploading to Supabase...')
    setProcessing(true)
    try {
      // Prepare rows (NDAs table). The table has columns pallet_id, document_name, page_number
      const rows = results.map((r) => ({
        pallet_id: r.palletId,
        document_name: r.documentName,
        page_number: r.page
      }))

      // Insert in batches to avoid very large inserts — do up to 200 per batch
      const batchSize = 200
      for (let i = 0; i < rows.length; i += batchSize) {
        const chunk = rows.slice(i, i + batchSize)
        const { data, error } = await supabase.from('NDAs').insert(chunk)
        if (error) {
          console.error('Supabase insert error', error)
          setStatus('Supabase error: ' + error.message)
          setProcessing(false)
          return
        }
      }

      setStatus(`Uploaded ${rows.length} records to Supabase.`)
    } catch (err) {
      console.error(err)
      setStatus('Upload error: ' + String(err))
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="container">
      <div className="header">
        <div>
          <h1>📦 Pallet ID Extractor</h1>
          <div className="small">Select a scanned PDF to extract 18-digit pallet IDs (multi-page, runs OCR per page).</div>
        </div>

        <div className="controls">
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            onChange={handleFile}
            disabled={processing}
          />
          <button
            className="btn"
            onClick={() => {
              if (fileRef.current) fileRef.current.click()
            }}
            disabled={processing}
          >
            Choose PDF
          </button>
        </div>
      </div>

      <div className="card">
        <div className="status">{status}</div>

        <div className="list">
          {results.length === 0 && <div className="small">No pallet IDs extracted yet.</div>}
          {results.map((r, idx) => (
            <div className="row" key={`${r.palletId}-${idx}`}>
              <div style={{ flex: 1 }}>
                <div className="id">{r.palletId}</div>
                <div className="meta">Document: {r.documentName} — Page: {r.page}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="footer">
          <div className="small">Found: {results.length} pallet ID{results.length === 1 ? '' : 's'}</div>
          <div>
            <button
              className="btn"
              onClick={uploadToSupabase}
              disabled={processing || results.length === 0}
            >
              Upload to Supabase
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
