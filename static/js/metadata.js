let currentFile = null;

const dropZone  = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const formCard  = document.getElementById('formCard');
const saveBtn   = document.getElementById('saveBtn');

setupDropZone(dropZone, fileInput, files => loadPDF(files[0]));

async function loadPDF(file) {
  currentFile = file;
  document.getElementById('fileLabel').textContent = file.name;
  formCard.classList.remove('hidden');

  /* Read existing metadata from server */
  const fd = new FormData();
  fd.append('pdf', file);
  try {
    const resp = await fetch('/api/metadata/info', { method: 'POST', body: fd });
    const data = await resp.json();
    if (resp.ok) {
      document.getElementById('title').value    = data.title    || '';
      document.getElementById('author').value   = data.author   || '';
      document.getElementById('subject').value  = data.subject  || '';
      document.getElementById('keywords').value = data.keywords || '';
      document.getElementById('pageCount').textContent = data.pages ? `${data.pages} pages` : '';
    } else {
      showToast(data.error || 'Could not read metadata.', 'warning');
    }
  } catch {
    showToast('Could not read metadata.', 'warning');
  }
}

saveBtn.addEventListener('click', async () => {
  if (!currentFile) { showToast('Upload a PDF first.', 'warning'); return; }

  const fd = new FormData();
  fd.append('pdf',      currentFile);
  fd.append('title',    document.getElementById('title').value);
  fd.append('author',   document.getElementById('author').value);
  fd.append('subject',  document.getElementById('subject').value);
  fd.append('keywords', document.getElementById('keywords').value);

  setLoading(saveBtn, true, 'Saving…');
  try {
    const { blob } = await apiPost('/api/metadata/save', fd);
    downloadBlob(blob, 'updated.pdf');
    showToast('Metadata saved and PDF downloaded!', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    setLoading(saveBtn, false);
  }
});
