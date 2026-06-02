/* ── Constants ────────────────────────────────────────────── */
const CHIP_THRESHOLD = 30;   // PDFs with ≤ this many pages get chip selectors
const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174';

/* ── PDF.js worker ────────────────────────────────────────── */
pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/pdf.worker.min.js`;

async function getPageCount(file) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
  return pdf.numPages;
}

/* ── State ────────────────────────────────────────────────── */
// Each item: { id, file, pageCount: number|null|-1, selected: Set<number>, rangeStr: string }
let fileItems = [];
let dragSrcId = null;

/* ── DOM refs ─────────────────────────────────────────────── */
const dropZone        = document.getElementById('dropZone');
const fileInput       = document.getElementById('fileInput');
const fileListSection = document.getElementById('fileListSection');
const fileList        = document.getElementById('fileList');
const fileCountEl     = document.getElementById('fileCount');
const clearAllBtn     = document.getElementById('clearAllBtn');
const mergeBtn        = document.getElementById('mergeBtn');
const mergeSummary    = document.getElementById('mergeSummary');
const progressSection = document.getElementById('progressSection');

/* ── File management ──────────────────────────────────────── */
function addFiles(rawFiles) {
  const pdfs = [...rawFiles].filter(
    f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
  );
  if (pdfs.length < rawFiles.length)
    showToast('Only PDF files are accepted.', 'warning');

  const newItems = pdfs.map(f => ({
    id: uid(),
    file: f,
    pageCount: null,
    selected: new Set(),
    rangeStr: '',
  }));

  fileItems.push(...newItems);
  render();

  /* async: load page counts for each new item */
  newItems.forEach(async item => {
    try {
      const count = await getPageCount(item.file);
      item.pageCount = count;
      item.selected  = new Set(Array.from({ length: count }, (_, i) => i + 1));
      item.rangeStr  = count > 1 ? `1-${count}` : '1';
    } catch {
      item.pageCount = -1;
    }
    rerenderItem(item.id);
    updateMergeSummary();
  });
}

function removeFile(id) {
  fileItems = fileItems.filter(i => i.id !== id);
  render();
}

function clearAll() {
  fileItems = [];
  render();
}

/* ── Page selection helpers ───────────────────────────────── */
function togglePage(id, page) {
  const item = fileItems.find(i => i.id === id);
  if (!item) return;
  if (item.selected.has(page)) item.selected.delete(page);
  else item.selected.add(page);
  rerenderItem(id);
  updateMergeSummary();
}

function setAllPages(id) {
  const item = fileItems.find(i => i.id === id);
  if (!item || !item.pageCount || item.pageCount < 0) return;
  if (item.pageCount <= CHIP_THRESHOLD) {
    item.selected = new Set(Array.from({ length: item.pageCount }, (_, i) => i + 1));
  } else {
    item.rangeStr = `1-${item.pageCount}`;
  }
  rerenderItem(id);
  updateMergeSummary();
}

function setNoPages(id) {
  const item = fileItems.find(i => i.id === id);
  if (!item || !item.pageCount || item.pageCount < 0) return;
  if (item.pageCount <= CHIP_THRESHOLD) {
    item.selected = new Set();
  } else {
    item.rangeStr = '';
  }
  rerenderItem(id);
  updateMergeSummary();
}

/* What string to send to the server for a given item */
function getSelectionStr(item) {
  if (!item.pageCount || item.pageCount < 1) return '';
  if (item.pageCount <= CHIP_THRESHOLD) {
    if (item.selected.size === item.pageCount) return '';           // all → empty = backend default
    return [...item.selected].sort((a, b) => a - b).join(',');
  }
  const val = item.rangeStr.trim();
  if (!val || val === `1-${item.pageCount}`) return '';             // all → empty
  return val;
}

/* Estimate total pages selected across all items (for the summary line) */
function getTotalSelected() {
  let total = 0;
  for (const item of fileItems) {
    if (!item.pageCount || item.pageCount < 0) continue;
    if (item.pageCount <= CHIP_THRESHOLD) {
      total += item.selected.size;
    } else {
      const val = item.rangeStr.trim();
      total += val ? countRangePages(val, item.pageCount) : item.pageCount;
    }
  }
  return total;
}

function countRangePages(rangeStr, total) {
  const seen = new Set();
  for (const part of rangeStr.split(',')) {
    const p = part.trim();
    if (p.includes('-')) {
      const [a, b] = p.split('-');
      const s = Math.max(1, parseInt(a) || 1);
      const e = Math.min(total, parseInt(b) || total);
      for (let i = s; i <= e; i++) seen.add(i);
    } else {
      const n = parseInt(p);
      if (!isNaN(n) && n >= 1 && n <= total) seen.add(n);
    }
  }
  return seen.size;
}

/* ── Drag-to-reorder (file rows) ──────────────────────────── */
function initDrag(li) {
  li.addEventListener('dragstart', e => {
    if (!e.target.closest('.file-drag-handle')) { e.preventDefault(); return; }
    dragSrcId = li.dataset.id;
    li.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  li.addEventListener('dragover', e => {
    if (!dragSrcId) return;
    e.preventDefault();
    li.classList.add('drag-over');
  });
  li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
  li.addEventListener('drop', e => {
    e.preventDefault();
    e.stopPropagation();
    li.classList.remove('drag-over');
    const targetId = li.dataset.id;
    if (dragSrcId && dragSrcId !== targetId) {
      const si = fileItems.findIndex(i => i.id === dragSrcId);
      const ti = fileItems.findIndex(i => i.id === targetId);
      const [moved] = fileItems.splice(si, 1);
      fileItems.splice(ti, 0, moved);
      render();
    }
  });
  li.addEventListener('dragend', () => {
    document.querySelectorAll('.file-item').forEach(el =>
      el.classList.remove('dragging', 'drag-over')
    );
    dragSrcId = null;
  });
}

/* ── Render ───────────────────────────────────────────────── */
function render() {
  if (fileItems.length === 0) {
    fileListSection.style.display = 'none';
    dropZone.style.display = 'flex';
    updateMergeSummary();
    return;
  }
  dropZone.style.display = 'none';
  fileListSection.style.display = 'block';
  fileCountEl.textContent = fileItems.length;

  fileList.innerHTML = '';
  fileItems.forEach(item => {
    const li = buildItemEl(item);
    fileList.appendChild(li);
    initDrag(li);
  });
  updateMergeSummary();
}

/* Replace just one <li> without touching the rest of the list */
function rerenderItem(id) {
  const existing = fileList.querySelector(`li[data-id="${id}"]`);
  if (!existing) return;
  const item = fileItems.find(i => i.id === id);
  if (!item) return;
  const newEl = buildItemEl(item);
  fileList.replaceChild(newEl, existing);
  initDrag(newEl);
}

function buildItemEl(item) {
  const li = document.createElement('li');
  li.className = 'file-item';
  li.draggable = true;
  li.dataset.id = item.id;

  let badgeClass = '', badgeText = '';
  if (item.pageCount === null) {
    badgeClass = 'loading'; badgeText = 'Loading…';
  } else if (item.pageCount === -1) {
    badgeClass = 'error'; badgeText = 'Error';
  } else {
    badgeText = `${item.pageCount} page${item.pageCount !== 1 ? 's' : ''}`;
  }

  li.innerHTML = `
    <div class="file-main-row">
      <span class="file-drag-handle" title="Drag to reorder">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/>
          <circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/>
        </svg>
      </span>
      <span class="file-thumb">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="9" y1="13" x2="15" y2="13"/>
          <line x1="9" y1="17" x2="15" y2="17"/>
        </svg>
      </span>
      <span class="file-info">
        <span class="file-name">${escHtml(item.file.name)}</span>
        <span class="file-size">${formatSize(item.file.size)}</span>
      </span>
      <span class="file-page-badge ${badgeClass}">${escHtml(badgeText)}</span>
      <button class="file-remove" title="Remove">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
    ${buildPageSelector(item)}
  `;

  /* Remove button */
  li.querySelector('.file-remove').addEventListener('click', e => {
    e.stopPropagation();
    removeFile(item.id);
  });

  /* Page control buttons (only when page count is known) */
  if (item.pageCount > 0) {
    li.querySelector('[data-action="all"]').addEventListener('click', () => setAllPages(item.id));
    li.querySelector('[data-action="none"]').addEventListener('click', () => setNoPages(item.id));

    if (item.pageCount <= CHIP_THRESHOLD) {
      li.querySelectorAll('.page-chip').forEach(chip => {
        chip.addEventListener('click', () =>
          togglePage(item.id, parseInt(chip.dataset.page))
        );
      });
    } else {
      const rangeInput = li.querySelector('.page-range-input');
      rangeInput.addEventListener('input', () => {
        item.rangeStr = rangeInput.value;
        const info = li.querySelector('.page-count-info');
        if (info) updateInfoEl(info, item);
        updateMergeSummary();
      });
    }
  }

  return li;
}

function buildPageSelector(item) {
  /* Still loading */
  if (item.pageCount === null) {
    return `
      <div class="file-pages-row">
        <div class="page-loading">
          <div class="page-loading-dots"><span></span><span></span><span></span></div>
          Reading pages…
        </div>
      </div>`;
  }

  /* Error reading PDF */
  if (item.pageCount === -1) {
    return `
      <div class="file-pages-row">
        <span class="page-error">Could not read this PDF. Try re-uploading.</span>
      </div>`;
  }

  /* Info text */
  const info = buildInfoText(item);

  /* Chips vs range input */
  let selectorHTML = '';
  if (item.pageCount <= CHIP_THRESHOLD) {
    const chips = Array.from({ length: item.pageCount }, (_, i) => {
      const p = i + 1;
      return `<button class="page-chip ${item.selected.has(p) ? 'selected' : ''}" data-page="${p}">${p}</button>`;
    }).join('');
    selectorHTML = `<div class="page-chips">${chips}</div>`;
  } else {
    selectorHTML = `
      <div class="page-range-wrap">
        <input type="text" class="page-range-input"
               value="${escHtml(item.rangeStr)}"
               placeholder="e.g. 1-5, 8, 10-20" />
        <span class="page-range-hint">
          Use commas and ranges &mdash; e.g. <strong>1-5, 8, 10-20</strong> &nbsp;(max page: ${item.pageCount})
        </span>
      </div>`;
  }

  return `
    <div class="file-pages-row">
      <div class="page-selector-header">
        <span class="pages-label">Pages</span>
        <button class="page-ctrl-btn" data-action="all">All</button>
        <button class="page-ctrl-btn" data-action="none">None</button>
        <span class="page-count-info ${info.warn ? 'warn' : ''}">${info.text}</span>
      </div>
      ${selectorHTML}
    </div>`;
}

function buildInfoText(item) {
  if (item.pageCount <= CHIP_THRESHOLD) {
    const sel = item.selected.size;
    if (sel === 0)              return { text: 'No pages selected', warn: true };
    if (sel === item.pageCount) return { text: `All ${item.pageCount} pages`, warn: false };
    return { text: `${sel} of ${item.pageCount} pages`, warn: false };
  } else {
    const val = item.rangeStr.trim();
    if (!val) return { text: 'No pages selected', warn: true };
    const count = countRangePages(val, item.pageCount);
    if (count === 0)             return { text: 'No valid pages', warn: true };
    if (count === item.pageCount) return { text: `All ${item.pageCount} pages`, warn: false };
    return { text: `~${count} of ${item.pageCount} pages`, warn: false };
  }
}

function updateInfoEl(el, item) {
  const info = buildInfoText(item);
  el.textContent = info.text;
  el.className = `page-count-info${info.warn ? ' warn' : ''}`;
}

function updateMergeSummary() {
  if (!mergeSummary) return;
  const total = getTotalSelected();
  const n     = fileItems.length;
  if (n === 0 || total === 0) { mergeSummary.textContent = ''; return; }
  mergeSummary.textContent =
    `${total} page${total !== 1 ? 's' : ''} from ${n} PDF${n !== 1 ? 's' : ''}`;
}

/* ── Merge & download ─────────────────────────────────────── */
mergeBtn.addEventListener('click', async () => {
  if (fileItems.length === 0) {
    showToast('Add at least one PDF first.', 'warning'); return;
  }

  const stillLoading = fileItems.some(i => i.pageCount === null);
  if (stillLoading) {
    showToast('Still reading page counts — please wait a moment.', 'warning'); return;
  }

  const errored = fileItems.filter(i => i.pageCount === -1);
  if (errored.length) {
    showToast(`${errored.length} file(s) could not be read. Remove them and retry.`, 'error'); return;
  }

  /* Check each file has at least one page selected */
  const empty = fileItems.filter(item => {
    if (item.pageCount <= CHIP_THRESHOLD) return item.selected.size === 0;
    return !item.rangeStr.trim();
  });
  if (empty.length) {
    const names = empty.map(i => `"${i.file.name}"`).slice(0, 2).join(', ');
    showToast(`No pages selected for ${names}${empty.length > 2 ? '…' : ''}`, 'warning');
    return;
  }

  fileListSection.style.display = 'none';
  progressSection.style.display = 'flex';

  const formData = new FormData();
  fileItems.forEach(item => {
    formData.append('pdfs',  item.file);
    formData.append('pages', getSelectionStr(item));
  });

  try {
    const res = await fetch('/merge', { method: 'POST', body: formData });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Merge failed.' }));
      throw new Error(err.error || 'Merge failed.');
    }
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: 'merged.pdf' });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('PDF merged and downloaded!', 'success');
    clearAll();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    progressSection.style.display = 'none';
    if (fileItems.length > 0) fileListSection.style.display = 'block';
    else dropZone.style.display = 'flex';
  }
});

/* ── Drop zone events ─────────────────────────────────────── */
dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', ()  => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  addFiles(e.dataTransfer.files);
});
dropZone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = ''; });

document.getElementById('addMoreBtn').addEventListener('click', () => fileInput.click());
clearAllBtn.addEventListener('click', clearAll);

/* ── Utilities ────────────────────────────────────────────── */
function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function formatSize(bytes) {
  if (bytes < 1024)    return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ── Toast ────────────────────────────────────────────────── */
function showToast(message, type = 'info') {
  document.querySelector('.toast')?.remove();
  const icons = {
    success: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><polyline points="20 6 9 17 4 12"/></svg>`,
    warning: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    error:   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    info:    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `${icons[type]}<span>${escHtml(message)}</span>`;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast-show'));
  setTimeout(() => { toast.classList.remove('toast-show'); setTimeout(() => toast.remove(), 300); }, 3500);
}

/* Toast styles */
const s = document.createElement('style');
s.textContent = `
.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(20px);display:flex;align-items:center;gap:10px;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:500;font-family:var(--font);z-index:9999;opacity:0;transition:opacity .25s ease,transform .25s ease;max-width:400px;box-shadow:0 8px 32px rgba(0,0,0,.5)}
.toast-show{opacity:1;transform:translateX(-50%) translateY(0)}
.toast-success{background:#14532d;color:#4ade80;border:1px solid rgba(74,222,128,.3)}
.toast-warning{background:#451a03;color:#fb923c;border:1px solid rgba(251,146,60,.3)}
.toast-error{background:#450a0a;color:#f87171;border:1px solid rgba(248,113,113,.3)}
.toast-info{background:#1e1b4b;color:#a5b4fc;border:1px solid rgba(165,180,252,.3)}
`;
document.head.appendChild(s);
