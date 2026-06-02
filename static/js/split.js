let currentFile = null;

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const fileInfo  = document.getElementById('fileInfo');
const splitOpts = document.getElementById('splitOptions');
const splitBtn  = document.getElementById('splitBtn');
const radios    = document.querySelectorAll('input[name="mode"]');
const rangesIn  = document.getElementById('rangesInput');
const nInput    = document.getElementById('nInput');

setupDropZone(dropZone, fileInput, files => loadFile(files[0]));

async function loadFile(file) {
  currentFile = file;
  document.getElementById('fileName').textContent  = file.name;
  document.getElementById('filePages').textContent = formatBytes(file.size);

  /* Get page count via PDF.js if available, otherwise just show size */
  try {
    const url = URL.createObjectURL(file);
    const pdfjsLib = window.pdfjsLib;
    if (pdfjsLib) {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const doc = await pdfjsLib.getDocument(url).promise;
      document.getElementById('filePages').textContent = `${doc.numPages} pages · ${formatBytes(file.size)}`;
    }
  } catch {}

  fileInfo.classList.remove('hidden');
  splitOpts.classList.remove('hidden');
}

document.getElementById('clearFile').addEventListener('click', () => {
  currentFile = null;
  fileInfo.classList.add('hidden');
  splitOpts.classList.add('hidden');
});

/* Enable/disable inputs based on mode */
radios.forEach(r => r.addEventListener('change', () => {
  const rangeMode = document.querySelector('input[name="mode"]:checked').value === 'ranges';
  rangesIn.disabled = !rangeMode;
  nInput.disabled   = rangeMode;
}));

splitBtn.addEventListener('click', async () => {
  if (!currentFile) { showToast('Upload a PDF first.', 'warning'); return; }
  const mode = document.querySelector('input[name="mode"]:checked').value;

  const fd = new FormData();
  fd.append('pdf', currentFile);
  fd.append('mode', mode);
  if (mode === 'ranges') fd.append('ranges', rangesIn.value);
  else fd.append('n', nInput.value);

  setLoading(splitBtn, true, 'Splitting…');
  try {
    const { blob, headers } = await apiPost('/api/split', fd);
    const isZip = (headers['content-type'] || '').includes('zip');
    downloadBlob(blob, isZip ? 'split.zip' : 'split.pdf');
    showToast(isZip ? 'Split into multiple PDFs — downloading ZIP' : 'Split PDF downloaded!', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    setLoading(splitBtn, false);
  }
});
