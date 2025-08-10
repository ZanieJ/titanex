import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// 🔹 Your Supabase credentials
const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_KEY = "YOUR_SUPABASE_ANON_KEY";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const dropZone = document.getElementById("drop-zone");
const statusEl = document.getElementById("status");
const idList = document.getElementById("id-list");
const pushBtn = document.getElementById("push-btn");

let extractedIds = new Set();

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.style.background = "#eef";
});

dropZone.addEventListener("dragleave", () => {
  dropZone.style.background = "#fff";
});

dropZone.addEventListener("drop", async (e) => {
  e.preventDefault();
  dropZone.style.background = "#fff";

  const file = e.dataTransfer.files[0];
  if (!file || file.type !== "application/pdf") {
    statusEl.textContent = "Please drop a PDF file.";
    return;
  }

  extractedIds.clear();
  idList.innerHTML = "";
  pushBtn.style.display = "none";

  await extractPalletIdsFromPDF(file);
});

async function extractPalletIdsFromPDF(file) {
  statusEl.textContent = "Loading PDF...";
  const pdfData = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;

  statusEl.textContent = `PDF loaded: ${pdf.numPages} pages. Starting OCR...`;

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    statusEl.textContent = `Processing page ${pageNum} of ${pdf.numPages}...`;
    console.log(`Processing page ${pageNum}/${pdf.numPages}`);

    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({ canvasContext: ctx, viewport }).promise;

    const { data: { text } } = await Tesseract.recognize(canvas, "eng", {
      logger: m => console.log(`Tesseract [page ${pageNum}]:`, m)
    });

    console.log(`OCR text for page ${pageNum}:`, text);

    const matches = text.replace(/\s/g, "").match(/\d{18}/g);
    if (matches) {
      matches.forEach(id => extractedIds.add(id));
    }
  }

  if (extractedIds.size > 0) {
    statusEl.textContent = `✅ Found ${extractedIds.size} pallet IDs`;
    displayIds();
    pushBtn.style.display = "inline-block";
  } else {
    statusEl.textContent = "❌ No pallet IDs found in this PDF.";
  }
}

function displayIds() {
  idList.innerHTML = "";
  extractedIds.forEach(id => {
    const li = document.createElement("li");
    li.textContent = id;
    idList.appendChild(li);
  });
}

pushBtn.addEventListener("click", async () => {
  statusEl.textContent = "Pushing to Supabase...";
  const { error } = await supabase.from("NDAs").insert(
    Array.from(extractedIds).map(id => ({
      pallet_id: id,
      document_name: "Uploaded PDF",
      page_number: 1
    }))
  );
  if (error) {
    statusEl.textContent = "❌ Error pushing to Supabase: " + error.message;
  } else {
    statusEl.textContent = "✅ Data pushed to Supabase!";
  }
});
