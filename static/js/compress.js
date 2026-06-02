let currentFile = null;

const dropZone   = document.getElementById('dropZone');
const fileInput  = document.getElementById('fileInput');
const fileCard   = document.getElementById('fileCard');
const compressBtn= document.getElementById('compressBtn');

setupDropZone(dropZone, fileInput, files => loadFile(files[0]));

function loadFile(file) {
  currentFile = file;
  document.getElementById('fileName').textContent = file.name;
  document.getElementById('origSize').textContent = formatBytes(file.size);
  document.getElementById('statsRow').classList.add('hidden');
  fileCard.classList.remove('hidden');
}

document.getElementById('clearFile').addEventListener('click', () => {
  currentFile = null;
  fileCard.classList.add('hidden');
});

compressBtn.addEventListener('click', async () => {
  if (!currentFile) { showToast('Upload a PDF first.', 'warning'); return; }

  setLoading(compressBtn, true, 'Compressing…');
  const fd = new FormData();
  fd.append('pdf', currentFile);

  try {
    const { blob, headers } = await apiPost('/api/compress', fd);
    const orig = parseInt(headers['x-original-size']   || 0);
    const comp = parseInt(headers['x-compressed-size'] || 0);

    if (orig && comp) {
      const saved = orig - comp;
      const pct   = ((saved / orig) * 100).toFixed(1);
      document.getElementById('statOrig').textContent  = formatBytes(orig);
      document.getElementById('statComp').textContent  = formatBytes(comp);
      document.getElementById('statSaved').textContent = `${pct}%`;
      document.getElementById('statsRow').classList.remove('hidden');
    }

    downloadBlob(blob, 'compressed.pdf');
    showToast('Compressed PDF downloaded!', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    setLoading(compressBtn, false);
  }
});
