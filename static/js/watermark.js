let currentFile = null;

const dropZone   = document.getElementById('dropZone');
const fileInput  = document.getElementById('fileInput');
const optCard    = document.getElementById('optionsCard');
const applyBtn   = document.getElementById('applyBtn');

setupDropZone(dropZone, fileInput, files => {
  currentFile = files[0];
  document.getElementById('fileLabel').textContent = files[0].name;
  optCard.classList.remove('hidden');
});

/* Live labels */
const sliders = [
  ['wmFont',     'fontSizeVal',  v => v + 'px'],
  ['wmOpacity',  'opacityVal',   v => v + '%'],
  ['wmRotation', 'rotationVal',  v => v + '°'],
];
sliders.forEach(([id, labelId, fmt]) => {
  const el = document.getElementById(id);
  el.addEventListener('input', () => {
    document.getElementById(labelId).textContent = fmt(el.value);
  });
});

applyBtn.addEventListener('click', async () => {
  if (!currentFile) { showToast('Upload a PDF first.', 'warning'); return; }

  const fd = new FormData();
  fd.append('pdf',      currentFile);
  fd.append('text',     document.getElementById('wmText').value || 'WATERMARK');
  fd.append('opacity',  (parseFloat(document.getElementById('wmOpacity').value) / 100).toFixed(2));
  fd.append('rotation', document.getElementById('wmRotation').value);
  fd.append('fontsize', document.getElementById('wmFont').value);
  fd.append('position', document.getElementById('wmPos').value);

  setLoading(applyBtn, true, 'Applying…');
  try {
    const { blob } = await apiPost('/api/watermark', fd);
    downloadBlob(blob, 'watermarked.pdf');
    showToast('Watermarked PDF downloaded!', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    setLoading(applyBtn, false);
  }
});
