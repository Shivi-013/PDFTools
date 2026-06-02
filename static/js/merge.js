/* ── PDF.js setup ──────────────────────────────────────────── */
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

/* ── State ─────────────────────────────────────────────────── */
const pdfs  = [];  // { id, name, file, pdfDoc, pages: [PDFPageProxy] }
const queue = [];  // { id, pdfId, pdfIdx, pageNum, rotation }
let nextQid = 1;

/* ── DOM ────────────────────────────────────────────────────── */
const dropZone     = document.getElementById('dropZone');
const fileInput    = document.getElementById('fileInput');
const pdfPanels    = document.getElementById('pdfPanels');
const queueSection = document.getElementById('queueSection');
const mergeQueue   = document.getElementById('mergeQueue');
const queueEmpty   = document.getElementById('queueEmpty');
const queueBadge   = document.getElementById('queueBadge');
const clearQueueBtn= document.getElementById('clearQueueBtn');
const mergeBtn     = document.getElementById('mergeBtn');
const mergeInfo    = document.getElementById('mergeInfo');

/* ── Drop zone ─────────────────────────────────────────────── */
setupDropZone(dropZone, fileInput, addPDFs, '.pdf');

async function addPDFs(files) {
  for (const file of files) {
    const id  = 'pdf_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const url = URL.createObjectURL(file);
    const panel = createLoadingPanel(id, file.name);
    pdfPanels.appendChild(panel);

    try {
      const pdfDoc = await pdfjsLib.getDocument(url).promise;
      const pages  = [];
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        pages.push(await pdfDoc.getPage(i));
      }
      const entry = { id, name: file.name, file, pdfDoc, pages };
      pdfs.push(entry);
      await buildPanel(panel, entry);
    } catch (e) {
      panel.innerHTML = `<p class="text-red-400 text-sm p-4">Could not read "${escHtml(file.name)}"</p>`;
    }
  }
}

/* ── Panel rendering ───────────────────────────────────────── */
function createLoadingPanel(id, name) {
  const div = document.createElement('div');
  div.id = 'panel_' + id;
  div.className = 'bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5';
  div.innerHTML = `
    <div class="flex items-center gap-2 mb-4">
      <div class="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full spin"></div>
      <span class="text-sm text-slate-400">Loading ${escHtml(name)}…</span>
    </div>
    <div class="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-2 animate-pulse">
      ${Array(6).fill('<div class="aspect-[3/4] bg-slate-200 dark:bg-slate-700 rounded-lg"></div>').join('')}
    </div>`;
  return div;
}

async function buildPanel(panelEl, entry) {
  const { id, name, file, pages } = entry;
  const pdfIdx = pdfs.findIndex(p => p.id === id);

  panelEl.innerHTML = `
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
        </div>
        <div class="min-w-0">
          <p class="font-semibold text-sm truncate">${escHtml(name)}</p>
          <p class="text-xs text-slate-400">${pages.length} page${pages.length !== 1 ? 's' : ''} · ${formatBytes(file.size)}</p>
        </div>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <button data-pdf-id="${id}" class="select-all-btn text-xs text-purple-500 hover:text-purple-700 font-medium px-2 py-1 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors">All</button>
        <button data-pdf-id="${id}" class="remove-pdf-btn text-xs text-slate-400 hover:text-red-400 font-medium px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">✕ Remove</button>
      </div>
    </div>
    <div class="thumb-grid grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2" id="grid_${id}"></div>`;

  const grid = panelEl.querySelector(`#grid_${id}`);

  /* Render all page thumbnails */
  for (let i = 0; i < pages.length; i++) {
    const pageNum = i + 1;
    const wrapper = document.createElement('div');
    wrapper.className = 'relative group cursor-pointer rounded-lg overflow-hidden border-2 border-transparent hover:border-purple-400 transition-all';
    wrapper.dataset.pdfId    = id;
    wrapper.dataset.pdfIdx   = pdfIdx;
    wrapper.dataset.pageNum  = pageNum;

    const canvas = document.createElement('canvas');
    canvas.className = 'thumb-canvas bg-white dark:bg-slate-700';
    await renderPage(pages[i], canvas, 0.18);

    const label = document.createElement('div');
    label.className = 'absolute bottom-0 inset-x-0 bg-slate-900/70 text-white text-center text-[10px] py-0.5 font-medium';
    label.textContent = pageNum;

    const badge = document.createElement('div');
    badge.className = 'count-badge absolute top-1 right-1 bg-purple-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center hidden';
    badge.id = `badge_${id}_${pageNum}`;

    wrapper.append(canvas, label, badge);
    wrapper.addEventListener('click', () => addToQueue(id, pdfIdx, pageNum));
    grid.appendChild(wrapper);
  }

  /* Select all */
  panelEl.querySelector('.select-all-btn').addEventListener('click', () => {
    pages.forEach((_, i) => addToQueue(id, pdfIdx, i + 1));
  });

  /* Remove PDF */
  panelEl.querySelector('.remove-pdf-btn').addEventListener('click', () => {
    /* Remove all queue items for this PDF */
    const toRemove = queue.filter(q => q.pdfId === id).map(q => q.id);
    toRemove.forEach(removeFromQueue);
    const idx = pdfs.findIndex(p => p.id === id);
    if (idx !== -1) pdfs.splice(idx, 1);
    panelEl.remove();
  });
}

/* ── Thumbnail render ──────────────────────────────────────── */
async function renderPage(page, canvas, scale, rotation = 0) {
  const vp  = page.getViewport({ scale, rotation });
  canvas.width  = vp.width;
  canvas.height = vp.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
}

/* ── Merge Queue ───────────────────────────────────────────── */
const sortable = Sortable.create(mergeQueue, {
  animation: 150,
  filter: 'button,input',
  ghostClass: 'sortable-ghost',
  dragClass:  'sortable-drag',
  onEnd: updateMergeInfo,
});

async function addToQueue(pdfId, pdfIdx, pageNum) {
  const entry = pdfs.find(p => p.id === pdfId);
  if (!entry) return;

  const qid  = 'q_' + (nextQid++);
  const item = { id: qid, pdfId, pdfIdx, pageNum, rotation: 0 };
  queue.push(item);

  /* Build queue DOM item */
  const el = document.createElement('div');
  el.id        = qid;
  el.className = 'flex-shrink-0 w-24 bg-white dark:bg-slate-800 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 flex flex-col cursor-grab active:cursor-grabbing shadow-sm';

  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'relative';
  const canvas = document.createElement('canvas');
  canvas.className = 'thumb-canvas bg-white dark:bg-slate-700';
  await renderPage(entry.pages[pageNum - 1], canvas, 0.2, 0);
  canvasWrap.appendChild(canvas);
  el.appendChild(canvasWrap);

  const info = document.createElement('div');
  info.className = 'px-1.5 pt-1 pb-0.5 bg-slate-50 dark:bg-slate-900/60';
  info.innerHTML = `
    <div class="text-[10px] text-slate-500 dark:text-slate-400 truncate leading-tight mb-1">${escHtml(entry.name.replace('.pdf',''))} · p${pageNum}</div>
    <div class="flex items-center justify-between gap-0.5">
      <div class="flex gap-0.5">
        <button class="q-rot-l p-0.5 rounded text-slate-400 hover:text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors" data-tip="Rotate left">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3"/></svg>
        </button>
        <button class="q-rot-r p-0.5 rounded text-slate-400 hover:text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors" data-tip="Rotate right">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.49-3"/></svg>
        </button>
      </div>
      <button class="q-del p-0.5 rounded text-slate-400 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" data-tip="Remove">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`;
  el.appendChild(info);

  /* Rotation buttons */
  el.querySelector('.q-rot-l').addEventListener('click', async e => {
    e.stopPropagation();
    item.rotation = (item.rotation - 90 + 360) % 360;
    await renderPage(entry.pages[pageNum - 1], canvas, 0.2, item.rotation);
  });
  el.querySelector('.q-rot-r').addEventListener('click', async e => {
    e.stopPropagation();
    item.rotation = (item.rotation + 90) % 360;
    await renderPage(entry.pages[pageNum - 1], canvas, 0.2, item.rotation);
  });
  el.querySelector('.q-del').addEventListener('click', e => {
    e.stopPropagation();
    removeFromQueue(qid);
  });

  /* Hide the empty placeholder */
  queueEmpty?.classList.add('hidden');
  mergeQueue.appendChild(el);

  /* Update badge */
  updateBadge(pdfId, pageNum, +1);
  updateQueueUI();
}

function removeFromQueue(qid) {
  const idx = queue.findIndex(q => q.id === qid);
  if (idx === -1) return;
  const item = queue[idx];
  queue.splice(idx, 1);
  document.getElementById(qid)?.remove();
  updateBadge(item.pdfId, item.pageNum, -1);
  updateQueueUI();
}

function updateBadge(pdfId, pageNum, delta) {
  const badge = document.getElementById(`badge_${pdfId}_${pageNum}`);
  if (!badge) return;
  const count = parseInt(badge.dataset.count || '0') + delta;
  badge.dataset.count = count;
  if (count > 0) {
    badge.textContent = count;
    badge.classList.remove('hidden');
    badge.closest('[data-page-num]')?.classList.add('page-selected');
  } else {
    badge.classList.add('hidden');
    badge.closest('[data-page-num]')?.classList.remove('page-selected');
  }
}

function updateQueueUI() {
  queueBadge.textContent = queue.length;
  queueSection.classList.toggle('hidden', queue.length === 0);
  if (queue.length === 0) queueEmpty?.classList.remove('hidden');
  updateMergeInfo();
}

function updateMergeInfo() {
  const items = mergeQueue.querySelectorAll('[id^="q_"]');
  mergeInfo.textContent = items.length
    ? `${items.length} page${items.length !== 1 ? 's' : ''} from ${new Set(queue.map(q => q.pdfId)).size} PDF${new Set(queue.map(q => q.pdfId)).size !== 1 ? 's' : ''}`
    : '';
}

clearQueueBtn.addEventListener('click', () => {
  [...queue].forEach(q => removeFromQueue(q.id));
});

/* ── Merge ─────────────────────────────────────────────────── */
mergeBtn.addEventListener('click', async () => {
  const items = [...mergeQueue.querySelectorAll('[id^="q_"]')];
  if (!items.length) { showToast('Add pages to the queue first.', 'warning'); return; }

  setLoading(mergeBtn, true, 'Merging…');

  const formData = new FormData();
  pdfs.forEach(p => formData.append('pdfs', p.file));

  items.forEach(el => {
    const qItem = queue.find(q => q.id === el.id);
    if (!qItem) return;
    formData.append('file_indices', qItem.pdfIdx);
    formData.append('page_nums',    qItem.pageNum);
    formData.append('rotations',    qItem.rotation);
  });

  try {
    const { blob } = await apiPost('/api/merge', formData);
    downloadBlob(blob, 'merged.pdf');
    showToast('PDF merged and downloaded!', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    setLoading(mergeBtn, false);
  }
});
