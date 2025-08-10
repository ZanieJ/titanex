import Tesseract from 'tesseract.js';

const fileInput = document.getElementById('pdf-upload');
const progressEl = document.getElementById('progress');
const outputEl = document.getElementById('output');

function setProgress(msg) {
  progressEl.textContent = msg;
}

fileInput.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  setProgress('Loading PDF...');
  const pdfData = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;

  let foundIds = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    setProgress(`Processing page ${pageNum} of ${pdf.numPages}...`);

    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({ canvasContext: context, viewport }).promise;

    setProgress(`Running OCR on page ${pageNum}...`);
    const { data: { text } } = await Tesseract.recognize(canvas, 'eng');

    // Extract only pallet IDs under "Pallet ID" heading
    const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
    let capture = false;
    for (let line of lines) {
      if (/^Pallet ID$/i.test(line)) {
        capture = true;
        continue;
      }
      if (capture && /^\d{18}$/.test(line)) {
        foundIds.push(line);
      }
    }
  }

  if (foundIds.length > 0) {
    outputEl.value = foundIds.join('\n');
    setProgress(`Found ${foundIds.length} Pallet IDs`);
  } else {
    outputEl.value = '';
    setProgress('No Pallet IDs found.');
  }
});
