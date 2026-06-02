let imageFiles = [];

const dropZone     = document.getElementById('dropZone');
const fileInput    = document.getElementById('fileInput');
const imageSection = document.getElementById('imageSection');
const imageGrid    = document.getElementById('imageGrid');
const imgCountEl   = document.getElementById('imgCount');
const convertBtn   = document.getElementById('convertBtn');
const clearBtn     = document.getElementById('clearBtn');
const addMoreBtn   = document.getElementById('addMoreBtn');

setupDropZone(dropZone, fileInput, addImages, '.jpg,.jpeg,.png');
addMoreBtn.addEventListener('click', () => fileInput.click());
clearBtn.addEventListener('click', () => { imageFiles = []; renderGrid(); });

function addImages(files) {
  imageFiles.push(...files);
  renderGrid();
}

function renderGrid() {
  imageGrid.innerHTML = '';
  imgCountEl.textContent = imageFiles.length;
  imageSection.classList.toggle('hidden', imageFiles.length === 0);

  imageFiles.forEach((file, i) => {
    const url = URL.createObjectURL(file);
    const wrap = document.createElement('div');
    wrap.className = 'relative group rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 aspect-square bg-slate-100 dark:bg-slate-700 cursor-grab';
    wrap.dataset.idx = i;

    const img = document.createElement('img');
    img.src = url;
    img.className = 'w-full h-full object-cover';
    img.onload = () => URL.revokeObjectURL(url);

    const del = document.createElement('button');
    del.className = 'absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity font-bold leading-none';
    del.textContent = '×';
    del.addEventListener('click', e => { e.stopPropagation(); imageFiles.splice(i, 1); renderGrid(); });

    const label = document.createElement('div');
    label.className = 'absolute bottom-0 inset-x-0 bg-black/50 text-white text-[10px] text-center py-0.5 truncate px-1';
    label.textContent = file.name;

    wrap.append(img, del, label);
    imageGrid.appendChild(wrap);
  });

  /* Re-init SortableJS after grid rebuild */
  Sortable.create(imageGrid, {
    animation: 150,
    ghostClass: 'sortable-ghost',
    onEnd: evt => {
      const moved = imageFiles.splice(evt.oldIndex, 1)[0];
      imageFiles.splice(evt.newIndex, 0, moved);
    },
  });
}

convertBtn.addEventListener('click', async () => {
  if (!imageFiles.length) { showToast('Add images first.', 'warning'); return; }

  const fd = new FormData();
  /* Send in current DOM order */
  const items = [...imageGrid.children];
  items.forEach(item => {
    const idx = parseInt(item.dataset.idx);
    fd.append('images', imageFiles[idx]);
  });

  setLoading(convertBtn, true, 'Converting…');
  try {
    const { blob } = await apiPost('/api/img2pdf', fd);
    downloadBlob(blob, 'images.pdf');
    showToast('PDF created and downloaded!', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    setLoading(convertBtn, false);
  }
});
