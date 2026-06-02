/* ── Dark Mode ─────────────────────────────────────────────── */
(function () {
  const saved = localStorage.getItem('theme');
  if (saved === 'light') {
    document.documentElement.classList.remove('dark');
  } else {
    document.documentElement.classList.add('dark');
  }
})();

document.addEventListener('DOMContentLoaded', () => {
  const btn   = document.getElementById('themeToggle');
  const label = document.getElementById('themeLabel');
  const sun   = document.getElementById('sunIcon');
  const moon  = document.getElementById('moonIcon');

  function updateUI() {
    const dark = document.documentElement.classList.contains('dark');
    if (label) label.textContent = dark ? 'Light Mode' : 'Dark Mode';
    if (sun)  sun.classList.toggle('hidden', !dark);
    if (moon) moon.classList.toggle('hidden', dark);
  }

  updateUI();

  if (btn) {
    btn.addEventListener('click', () => {
      document.documentElement.classList.toggle('dark');
      localStorage.setItem('theme',
        document.documentElement.classList.contains('dark') ? 'dark' : 'light');
      updateUI();
    });
  }

  /* Mobile sidebar toggle */
  const menuBtn  = document.getElementById('menuBtn');
  const sidebar  = document.getElementById('sidebar');
  const overlay  = document.getElementById('sidebarOverlay');

  if (menuBtn && sidebar) {
    menuBtn.addEventListener('click', () => {
      sidebar.classList.toggle('-translate-x-full');
      overlay?.classList.toggle('hidden');
    });
    overlay?.addEventListener('click', () => {
      sidebar.classList.add('-translate-x-full');
      overlay.classList.add('hidden');
    });
  }
});

/* ── Toast ─────────────────────────────────────────────────── */
function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const colors = {
    success: 'bg-green-900 border-green-700 text-green-300',
    warning: 'bg-amber-900 border-amber-700 text-amber-300',
    error:   'bg-red-900 border-red-700 text-red-300',
    info:    'bg-slate-700 border-slate-600 text-slate-200',
  };
  const icons = {
    success: '✓',
    warning: '⚠',
    error:   '✕',
    info:    'ℹ',
  };

  const toast = document.createElement('div');
  toast.className = `pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium shadow-xl transition-all duration-300 opacity-0 translate-y-2 ${colors[type] || colors.info}`;
  toast.innerHTML = `<span class="text-base">${icons[type] || '●'}</span><span>${escHtml(msg)}</span>`;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.remove('opacity-0', 'translate-y-2');
  });

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

/* ── File Download ─────────────────────────────────────────── */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ── API helper ────────────────────────────────────────────── */
async function apiPost(url, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.responseType = 'blob';

    if (onProgress) {
      xhr.upload.onprogress = e => {
        if (e.lengthComputable) onProgress(e.loaded / e.total);
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ blob: xhr.response, headers: {
          'x-original-size':   xhr.getResponseHeader('X-Original-Size'),
          'x-compressed-size': xhr.getResponseHeader('X-Compressed-Size'),
          'content-type':      xhr.getResponseHeader('Content-Type'),
        }});
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const err = JSON.parse(reader.result);
            reject(new Error(err.error || 'Request failed'));
          } catch {
            reject(new Error('Request failed'));
          }
        };
        reader.readAsText(xhr.response);
      }
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(formData);
  });
}

/* ── Generic upload zone setup ─────────────────────────────── */
function setupDropZone(zone, input, onFiles, accept = '.pdf') {
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drop-active'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drop-active'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drop-active');
    const files = [...e.dataTransfer.files];
    const filtered = accept === '*'
      ? files
      : files.filter(f => accept.split(',').some(a => f.name.toLowerCase().endsWith(a.trim())));
    if (filtered.length < files.length) showToast('Some files were skipped (wrong type).', 'warning');
    if (filtered.length) onFiles(filtered);
  });
  input.addEventListener('change', () => { if (input.files.length) onFiles([...input.files]); input.value = ''; });
}

/* ── Utilities ─────────────────────────────────────────────── */
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b/1024).toFixed(1) + ' KB';
  return (b/1048576).toFixed(1) + ' MB';
}
function setLoading(btn, yes, label = 'Processing…') {
  if (yes) {
    btn.dataset.origText = btn.innerHTML;
    btn.innerHTML = `<svg class="w-4 h-4 spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-opacity=".25"/><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/></svg> ${escHtml(label)}`;
    btn.disabled = true;
  } else {
    btn.innerHTML = btn.dataset.origText || btn.innerHTML;
    btn.disabled = false;
  }
}
