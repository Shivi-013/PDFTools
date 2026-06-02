pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let pdfDoc = null;

const dropZone   = document.getElementById('dropZone');
const fileInput  = document.getElementById('fileInput');
const controls   = document.getElementById('controls');
const pageGrid   = document.getElementById('pageGrid');
const downloadBtn= document.getElementById('downloadBtn');
const scaleSelect= document.getElementById('scaleSelect');

setupDropZone(dropZone, fileInput, files => loadPDF(files[0]));

async function loadPDF(file) {
  const url = URL.createObjectURL(file);
  pdfDoc = await pdfjsLib.getDocument(url).promise;
  controls.classList.remove('hidden');
  await renderPreviews();
}

async function renderPreviews() {
  pageGrid.innerHTML = '';
  const scale = parseFloat(scaleSelect.value) * 0.15; // preview scale
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const vp   = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width  = vp.width;
    canvas.height = vp.height;
    canvas.className = 'thumb-canvas rounded-lg border border-slate-200 dark:border-slate-700 bg-white';
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;

    const wrap = document.createElement('div');
    wrap.className = 'flex flex-col items-center gap-1';
    const label = document.createElement('p');
    label.className = 'text-[10px] text-slate-400';
    label.textContent = `Page ${i}`;
    wrap.append(canvas, label);
    pageGrid.appendChild(wrap);
  }
}

scaleSelect.addEventListener('change', () => { if (pdfDoc) renderPreviews(); });

downloadBtn.addEventListener('click', async () => {
  if (!pdfDoc) { showToast('Upload a PDF first.', 'warning'); return; }

  setLoading(downloadBtn, true, 'Rendering…');
  const fmt   = document.querySelector('input[name="fmt"]:checked').value;
  const scale = parseFloat(scaleSelect.value);
  const zip   = new JSZip();
  const mimeType = fmt === 'jpeg' ? 'image/jpeg' : 'image/png';
  const quality  = fmt === 'jpeg' ? 0.92 : undefined;

  try {
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const vp   = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width  = vp.width;
      canvas.height = vp.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      const dataURL = canvas.toDataURL(mimeType, quality);
      const base64  = dataURL.split(',')[1];
      zip.file(`page_${String(i).padStart(3,'0')}.${fmt}`, base64, { base64: true });
    }
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    downloadBlob(blob, `pages.zip`);
    showToast('Images downloaded as ZIP!', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    setLoading(downloadBtn, false);
  }
});
