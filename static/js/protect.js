let currentFile = null;

const dropZone  = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const formCard  = document.getElementById('formCard');
const protectBtn= document.getElementById('protectBtn');
const pwInput   = document.getElementById('pwInput');
const pwConfirm = document.getElementById('pwConfirm');
const pwError   = document.getElementById('pwError');

setupDropZone(dropZone, fileInput, files => {
  currentFile = files[0];
  document.getElementById('fileLabel').textContent = files[0].name;
  formCard.classList.remove('hidden');
});

protectBtn.addEventListener('click', async () => {
  if (!currentFile) { showToast('Upload a PDF first.', 'warning'); return; }

  const pw  = pwInput.value.trim();
  const pw2 = pwConfirm.value.trim();

  if (!pw) {
    pwError.textContent = 'Please enter a password.';
    pwError.classList.remove('hidden');
    return;
  }
  if (pw !== pw2) {
    pwError.textContent = 'Passwords do not match.';
    pwError.classList.remove('hidden');
    return;
  }
  pwError.classList.add('hidden');

  const fd = new FormData();
  fd.append('pdf', currentFile);
  fd.append('password', pw);

  setLoading(protectBtn, true, 'Encrypting…');
  try {
    const { blob } = await apiPost('/api/protect', fd);
    downloadBlob(blob, 'protected.pdf');
    showToast('Password-protected PDF downloaded!', 'success');
    pwInput.value = '';
    pwConfirm.value = '';
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    setLoading(protectBtn, false);
  }
});
