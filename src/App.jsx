import React, { useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import Tesseract from 'tesseract.js'

// Supabase client — Netlify will populate these env vars during build/runtime
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

export default function App() {
  const [palletInput, setPalletInput] = useState('')
  const [results, setResults] = useState({})
  const [loading, setLoading] = useState(false)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrProgress, setOcrProgress] = useState(0)

  // Preprocess image in the browser using a canvas:
  //  - resize to a reasonable working size
  //  - convert to grayscale
  //  - apply adaptive-ish threshold (simple global threshold after contrast)
  //  - return a Blob which Tesseract will consume
  const preprocessImageToBlob = (file) =>
    new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        try {
          // Set target width (larger helps OCR but keep reasonable)
          const MAX_WIDTH = 1600
          let { width, height } = img
          if (width > MAX_WIDTH) {
            const ratio = MAX_WIDTH / width
            width = MAX_WIDTH
            height = Math.round(height * ratio)
          }

          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')

          // Draw original
          ctx.drawImage(img, 0, 0, width, height)

          // Get image data
          const imageData = ctx.getImageData(0, 0, width, height)
          const data = imageData.data

          // Convert to grayscale and apply simple contrast/stretch
          // first compute avg and contrast factor
          let min = 255, max = 0
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2]
            const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
            data[i] = data[i + 1] = data[i + 2] = gray
            if (gray < min) min = gray
            if (gray > max) max = gray
          }

          // Stretch contrast so min -> 10 and max -> 245 (avoid pure 0/255)
          const inRange = max - min || 1
          const outMin = 10, outMax = 245
          const scale = (outMax - outMin) / inRange

          for (let i = 0; i < data.length; i += 4) {
            let g = data[i]
            g = Math.round((g - min) * scale + outMin)
            data[i] = data[i + 1] = data[i + 2] = g
          }

          // Simple global threshold: compute overall mean and threshold there
          let sum = 0, count = 0
          for (let i = 0; i < data.length; i += 4) {
            sum += data[i]
            count++
          }
          const mean = sum / count
          const threshold = Math.max(90, Math.min(180, Math.round(mean))) // clamp

          // Binarize: keep some smoothing by not forcing pure extremes entirely
          for (let i = 0; i < data.length; i += 4) {
            const v = data[i]
            const out = v < threshold ? 0 : 255
            data[i] = data[i + 1] = data[i + 2] = out
          }

          // Put back and export
          ctx.putImageData(imageData, 0, 0)

          // Optionally draw a white padding border to avoid clipping characters at edge
          const paddedCanvas = document.createElement('canvas')
          const pad = 20
          paddedCanvas.width = width + pad * 2
          paddedCanvas.height = height + pad * 2
          const pCtx = paddedCanvas.getContext('2d')
          pCtx.fillStyle = 'white'
          pCtx.fillRect(0, 0, paddedCanvas.width, paddedCanvas.height)
          pCtx.drawImage(canvas, pad, pad)

          paddedCanvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Preprocessing produced no blob'))
              } else {
                resolve(blob)
              }
            },
            'image/png',
            0.9
          )
        } catch (err) {
          reject(err)
        }
      }
      img.onerror = (e) => reject(new Error('Failed to load image'))
      // Read file as DataURL
      const reader = new FileReader()
      reader.onload = (ev) => {
        img.src = ev.target.result
      }
      reader.onerror = () => reject(new Error('Failed reading file'))
      reader.readAsDataURL(file)
    })

  // Robust extraction: gather exact \b\d{18}\b matches and also
  // search digit-only sequences for 18-digit substrings (handles spaces/hyphens)
  function extract18DigitIdsFromText(text) {
    const found = new Set()

    // direct 18-digit matches
    const direct = text.match(/\b\d{18}\b/g)
    if (direct) direct.forEach((s) => found.add(s))

    // sequences of digits: extract sliding 18-digit substrings
    const digitSeqs = text.match(/\d+/g) || []
    for (const seq of digitSeqs) {
      if (seq.length >= 18) {
        // get all non-overlapping (but we'll allow overlapping) 18-digit substrings
        for (let i = 0; i <= seq.length - 18; i++) {
          found.add(seq.substr(i, 18))
        }
      }
    }

    // also handle cases where OCR puts spaces/hyphens inside numbers, remove non-digits and scan
    const cleaned = text.replace(/[^0-9]/g, '')
    if (cleaned.length >= 18) {
      for (let i = 0; i <= cleaned.length - 18; i++) {
        found.add(cleaned.substr(i, 18))
      }
    }

    // Convert to array and keep order roughly as seen in the text (best-effort)
    return Array.from(found)
  }

  const handleImageUpload = async (e) => {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    setOcrLoading(true)
    setOcrProgress(0)

    try {
      // Preprocess image to a blob for better OCR results
      const preprocessedBlob = await preprocessImageToBlob(file)

      // Recognize using Tesseract.js in the browser
      const worker = Tesseract.createWorker({
        // logger shows progress; worker is ephemeral and will be terminated
        logger: (m) => {
          if (m.status === 'recognizing text' && m.progress) {
            setOcrProgress(Math.round(m.progress * 100))
          } else if (m.status) {
            // small status feedback (optional)
            // console.log(m.status, m.progress)
          }
        }
      })

      await worker.load()
      await worker.loadLanguage('eng')
      await worker.initialize('eng')

      const { data } = await worker.recognize(preprocessedBlob)

      await worker.terminate()

      // Extract robustly
      const ids = extract18DigitIdsFromText(data.text)

      // Deduplicate preserving original order: data.text order -> filter by first occurrence index
      const uniqueOrdered = Array.from(
        new Set(
          ids.sort((a, b) => {
            const ia = data.text.indexOf(a)
            const ib = data.text.indexOf(b)
            if (ia === -1 && ib === -1) return 0
            if (ia === -1) return 1
            if (ib === -1) return -1
            return ia - ib
          })
        )
      )

      setPalletInput(uniqueOrdered.join('\n'))
    } catch (err) {
      console.error(err)
      alert('OCR failed: ' + (err.message || err))
    } finally {
      setOcrLoading(false)
      setOcrProgress(0)
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

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <h2>Pallet ID NDA Lookup</h2>

      {/* File input — small and inline so layout remains effectively the same */}
      <input
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        style={{ marginBottom: '0.5rem', display: 'block' }}
        aria-label="Upload inspection report image to extract pallet IDs"
      />

      {ocrLoading && (
        <div style={{ marginBottom: '0.75rem' }}>
          Extracting pallet IDs... {ocrProgress}%
        </div>
      )}

      <textarea
        rows={10}
        placeholder="Paste pallet IDs, one per line..."
        style={{ width: '100%', marginBottom: '1rem' }}
        value={palletInput}
        onChange={(e) => setPalletInput(e.target.value)}
      />
      <button onClick={handleLookup} disabled={loading}>
        {loading ? 'Looking up...' : 'Lookup'}
      </button>

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
