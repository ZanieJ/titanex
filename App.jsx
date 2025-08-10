import React, { useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { createWorker } from "tesseract.js";
import { createClient } from "@supabase/supabase-js";

/* Netlify-safe: load PDF.js worker from CDN instead of bundling */
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

/* Supabase client (uses Vite env vars) */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/* small Levenshtein for fuzzy heading match */
function levenshtein(a = "", b = "") {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

/* normalize heading line for comparison */
function normalizeHeadingLine(line) {
  return line.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/* main component - layout preserved */
export default function App() {
  const [status, setStatus] = useState("");
  const [palletIds, setPalletIds] = useState([]);
  const [docName, setDocName] = useState("");

  /* Extract IDs under 'Pallet ID' heading for a single file */
  const processFile = useCallback(async (file) => {
    setDocName(file.name || "");
    setPalletIds([]);
    setStatus("Loading PDF...");
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      setStatus(`PDF loaded (${pdf.numPages} page${pdf.numPages > 1 ? "s" : ""}) — OCR starting...`);

      // create worker once
      const worker = await createWorker({ logger: null });

      const idsFound = [];

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        setStatus(`Rendering page ${pageNum} / ${pdf.numPages}...`);
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 3.0 }); // high-res render
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        await page.render({ canvasContext: ctx, viewport }).promise;

        setStatus(`OCR page ${pageNum}...`);
        // Use data URL to avoid DataCloneError
        const dataUrl = canvas.toDataURL("image/png");

        const { data: { text } } = await worker.recognize(dataUrl);

        // split lines, trim
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

        // find fuzzy heading line index
        let headingIndex = -1;
        const target = "palletid"; // normalized target
        for (let i = 0; i < lines.length; i++) {
          const norm = normalizeHeadingLine(lines[i]);
          // compute small distance
          const dist = levenshtein(norm, target);
          if (dist <= 2 || norm.includes(target)) { // tolerant
            headingIndex = i;
            break;
          }
        }

        if (headingIndex === -1) {
          // heading not found on this page — try approximate textual search:
          // look for any line containing 'pallet' and 'id' words close together
          for (let i = 0; i < lines.length; i++) {
            const lineLower = lines[i].toLowerCase();
            if (/\bpallet\b/i.test(lineLower) && /\bid\b/i.test(lineLower)) {
              headingIndex = i;
              break;
            }
          }
        }

        if (headingIndex !== -1) {
          // collect lines after heading that look like pallet IDs
          let consecutiveNonMatches = 0;
          for (let r = headingIndex + 1; r < lines.length; r++) {
            const raw = lines[r];
            // normalize common OCR mistakes: O->0, l/I->1
            const normalized = raw.replace(/[Oo]/g, "0").replace(/[lI]/g, "1");
            // extract only digits/separators
            const digitStr = normalized.replace(/[^0-9\s\-]/g, "");
            // remove spaces/dashes
            const digitsOnly = digitStr.replace(/[\s\-]/g, "");
            // check for 18-digit groups inside the line
            const matches = digitsOnly.match(/\d{18}/g);
            if (matches && matches.length) {
              matches.forEach(m => {
                idsFound.push({ palletId: m, page: pageNum, documentName: file.name });
              });
              consecutiveNonMatches = 0; // reset
            } else {
              // if the raw line maybe contains digits with spaces, try to extract digits sequences of length >=18 then trim to 18
              const fuzzy = digitStr.replace(/\s+/g, "");
              if (fuzzy.length >= 18) {
                // take first continuous 18-digit substring
                const match = fuzzy.match(/\d{18}/);
                if (match) {
                  idsFound.push({ palletId: match[0], page: pageNum, documentName: file.name });
                  consecutiveNonMatches = 0;
                  continue;
                }
              }
              consecutiveNonMatches++;
              if (consecutiveNonMatches >= 2) break; // stop after 2 non-matching lines
            }
          }
        } // end if heading found

        // continue to next page
      } // end pages

      await worker.terminate();

      // dedupe preserving order
      const seen = new Set();
      const dedup = [];
      for (const e of idsFound) {
        if (!seen.has(e.palletId)) {
          seen.add(e.palletId);
          dedup.push(e);
        }
      }

      setPalletIds(dedup);
      setStatus(dedup.length ? `Found ${dedup.length} pallet ID${dedup.length>1?'s':''}` : "No pallet IDs found under heading");
    } catch (err) {
      console.error("Processing error:", err);
      setStatus("Error processing file — see console");
    }
  }, []);

  /* drag/drop handlers */
  const onDrop = useCallback((e) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) processFile(f);
  }, [processFile]);

  const onFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) processFile(f);
  };

  /* push to supabase NDAs table */
  const pushToSupabase = async () => {
    if (!palletIds || palletIds.length === 0) return;
    setStatus("Uploading to Supabase...");
    try {
      // map to rows
      const rows = palletIds.map((r) => ({
        pallet_id: r.palletId,
        document_name: r.documentName,
        page_number: r.page,
      }));

      // insert in one call (adjust batch size if needed)
      const { error } = await supabase.from("NDAs").insert(rows);
      if (error) {
        console.error("Supabase error", error);
        setStatus("Supabase error — see console");
      } else {
        setStatus(`Uploaded ${rows.length} records to Supabase.`);
      }
    } catch (err) {
      console.error(err);
      setStatus("Error uploading to Supabase");
    }
  };

  return (
    <div style={{ fontFamily: "sans-serif", padding: 20 }}>
      <h1>📦 Pallet ID Extractor</h1>

      <div
        id="drop-zone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        style={{
          border: "3px dashed #666",
          padding: 40,
          width: 320,
          margin: "20px auto",
          cursor: "pointer",
          textAlign: "center",
        }}
      >
        Drop PDF here
        <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
          (or click to select)
        </div>
        <input
          type="file"
          accept="application/pdf"
          onChange={onFileChange}
          style={{ marginTop: 12 }}
        />
      </div>

      <div style={{ textAlign: "center", marginTop: 12 }}>
        <div style={{ fontSize: 14, color: "#333" }}>{status}</div>
      </div>

      <div style={{ maxWidth: 600, margin: "20px auto" }}>
        {palletIds.length === 0 && docName && <div style={{ color: "#666", textAlign: "center" }}>No pallet IDs found under the heading.</div>}

        {palletIds.length > 0 && (
          <>
            <div style={{ marginBottom: 8 }}>Found {palletIds.length} pallet ID{palletIds.length>1?'s':''}:</div>
            <div style={{ background: "#fff", borderRadius: 6, padding: 12 }}>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {palletIds.map((r) => (
                  <li key={r.palletId}>
                    <div style={{ fontFamily: "monospace" }}>{r.palletId}</div>
                    <div style={{ fontSize: 12, color: "#666" }}>Document: {r.documentName} — Page: {r.page}</div>
                  </li>
                ))}
              </ul>
              <div style={{ textAlign: "right", marginTop: 12 }}>
                <button onClick={pushToSupabase}>Push to Supabase</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
