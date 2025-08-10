import * as pdfjsLib from "pdfjs-dist/build/pdf";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.entry";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const fileInput = document.getElementById("fileInput");
const progress = document.getElementById("progress");
const output = document.getElementById("output");

fileInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const fileReader = new FileReader();
  fileReader.onload = async function () {
    const typedArray = new Uint8Array(this.result);
    const pdf = await pdfjsLib.getDocument(typedArray).promise;

    let foundIds = [];
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      progress.textContent = `Processing page ${pageNum} of ${pdf.numPages}...`;
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const lines = textContent.items.map(item => item.str.trim()).filter(Boolean);

      const palletIndex = lines.findIndex(line => /^Pallet\s*ID$/i.test(line));
      if (palletIndex !== -1) {
        for (let i = palletIndex + 1; i < lines.length; i++) {
          if (/^\d+$/.test(lines[i])) {
            foundIds.push(lines[i]);
          } else if (lines[i].length > 0 && !/^\d+$/.test(lines[i])) {
            break;
          }
        }
      }
    }

    progress.textContent = "";
    output.textContent = foundIds.length > 0 
      ? foundIds.join("\n") 
      : "No pallet IDs found";
  };

  fileReader.readAsArrayBuffer(file);
});
