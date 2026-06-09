const PDF_DIR = 'pdfs/';
const PDFJS_VERSION = '3.11.174';
const PDFJS_BASE = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/`;
const MAX_PANES = 2;

const grid = document.getElementById('grid');
const statusEl = document.getElementById('status');
const emptyEl = document.getElementById('empty');
const searchEl = document.getElementById('search');
const sizeSelect = document.getElementById('sizeSelect');
const modal = document.getElementById('modal');
const panesEl = document.getElementById('panes');
const addPaneSelect = document.getElementById('addPaneSelect');
const splitToggle = document.getElementById('splitToggle');

let allFiles = [];
let cardIndex = [];
let openPanes = [];
let splitDirection = 'horizontal';

pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;

function loadPdf(url) {
    return pdfjsLib.getDocument({
        url,
        cMapUrl: PDFJS_BASE + 'cmaps/',
        cMapPacked: true,
        standardFontDataUrl: PDFJS_BASE + 'standard_fonts/',
    }).promise;
}

async function listPdfs() {
    const res = await fetch(PDF_DIR);
    if (!res.ok) throw new Error(`無法讀取 ${PDF_DIR}（HTTP ${res.status}）`);
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const links = [...doc.querySelectorAll('a')];
    return links
        .map(a => decodeURIComponent(a.getAttribute('href') || ''))
        .filter(href => href.toLowerCase().endsWith('.pdf'))
        .map(href => href.replace(/^\.\//, ''));
}

async function renderThumbnail(canvas, url, containerWidth) {
    const pdf = await loadPdf(url);
    const page = await pdf.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    // Always render at least at the largest thumbnail width so switching to
    // 大縮圖 doesn't blur; smaller modes scale down via CSS without quality loss.
    const targetWidth = Math.max(containerWidth, 300);
    const scale = (targetWidth * window.devicePixelRatio) / baseViewport.width;
    const viewport = page.getViewport({ scale });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
}

function makeCard(filename) {
    const url = PDF_DIR + encodeURIComponent(filename);
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
        <div class="thumb"><span class="placeholder">載入中…</span></div>
        <div class="card-body"><p class="card-title" title="${filename}">${filename}</p></div>
    `;
    card.addEventListener('click', () => openModal(filename));

    const thumb = card.querySelector('.thumb');
    const canvas = document.createElement('canvas');
    thumb.appendChild(canvas);
    const containerWidth = thumb.clientWidth || 220;
    renderThumbnail(canvas, url, containerWidth)
        .then(() => {
            thumb.querySelector('.placeholder')?.remove();
        })
        .catch(err => {
            console.error('縮圖產生失敗：', filename, err);
            thumb.innerHTML = '<span class="placeholder">⚠ 無法預覽</span>';
        });

    return card;
}

function buildPaneElement(filename) {
    const url = PDF_DIR + encodeURIComponent(filename);
    const viewUrl = `${url}#zoom=page-width`;
    const pane = document.createElement('div');
    pane.className = 'pane';
    pane.innerHTML = `
        <div class="pane-header">
            <span class="pane-title" title="${filename}">${filename}</span>
            <a class="btn btn-sm" download="${filename}" href="${url}">下載</a>
            <button class="btn btn-sm pane-close" title="關閉此視窗">✕</button>
        </div>
        <iframe title="PDF 預覽" src="${viewUrl}"></iframe>
    `;
    pane.querySelector('.pane-close').addEventListener('click', () => closePane(filename));
    return pane;
}

function buildSplitter() {
    const sp = document.createElement('div');
    sp.className = 'splitter';
    sp.addEventListener('mousedown', startSplitterDrag);
    return sp;
}

function startSplitterDrag(e) {
    e.preventDefault();
    const splitter = e.currentTarget;
    const first = splitter.previousElementSibling;
    const second = splitter.nextElementSibling;
    if (!first || !second) return;

    const isVertical = panesEl.classList.contains('vertical');
    const rect = panesEl.getBoundingClientRect();

    // Ghost line shows where the new splitter will land; panes don't resize
    // until mouseup (Plan C — deferred apply).
    const ghost = document.createElement('div');
    ghost.className = 'splitter-ghost' + (isVertical ? ' vertical' : '');
    panesEl.appendChild(ghost);

    splitter.classList.add('dragging');
    document.body.classList.add(isVertical ? 'resizing-v' : 'resizing-h');
    panesEl.querySelectorAll('iframe').forEach(f => (f.style.pointerEvents = 'none'));

    let finalPercent = null;

    function onMove(ev) {
        let percent;
        if (isVertical) {
            const y = ev.clientY - rect.top;
            percent = (y / rect.height) * 100;
        } else {
            const x = ev.clientX - rect.left;
            percent = (x / rect.width) * 100;
        }
        const clamped = Math.max(15, Math.min(85, percent));
        finalPercent = clamped;
        if (isVertical) {
            ghost.style.top = `${clamped}%`;
        } else {
            ghost.style.left = `${clamped}%`;
        }
    }

    function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        splitter.classList.remove('dragging');
        document.body.classList.remove('resizing-h', 'resizing-v');
        panesEl.querySelectorAll('iframe').forEach(f => (f.style.pointerEvents = ''));
        ghost.remove();
        if (finalPercent !== null) {
            first.style.flex = `0 0 ${finalPercent}%`;
            second.style.flex = `1 1 auto`;
        }
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
}

function applySplitDirection() {
    panesEl.classList.toggle('vertical', splitDirection === 'vertical');
    splitToggle.textContent =
        splitDirection === 'vertical' ? '↔ 左右分割' : '↕ 上下分割';
    // reset any per-pane flex sizing set by previous drags
    panesEl.querySelectorAll('.pane').forEach(p => (p.style.flex = '1 1 0'));
}

function refreshAddPaneSelect() {
    const remaining = allFiles.filter(f => !openPanes.includes(f));
    const canAddMore = openPanes.length < MAX_PANES && remaining.length > 0;
    addPaneSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = canAddMore ? '+ 開另一個 PDF' : '（已開到上限）';
    addPaneSelect.appendChild(placeholder);
    for (const f of remaining) {
        const opt = document.createElement('option');
        opt.value = f;
        opt.textContent = f;
        addPaneSelect.appendChild(opt);
    }
    addPaneSelect.disabled = !canAddMore;
}

function rebuildPanes() {
    panesEl.innerHTML = '';
    openPanes.forEach((filename, i) => {
        if (i > 0) panesEl.appendChild(buildSplitter());
        const pane = buildPaneElement(filename);
        pane.style.flex = '1 1 0';
        panesEl.appendChild(pane);
    });
    refreshAddPaneSelect();
}

function openModal(filename) {
    openPanes = [filename];
    rebuildPanes();
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
}

function addPane(filename) {
    if (openPanes.length >= MAX_PANES) return;
    if (openPanes.includes(filename)) return;
    openPanes.push(filename);
    rebuildPanes();
}

function closePane(filename) {
    openPanes = openPanes.filter(f => f !== filename);
    if (openPanes.length === 0) {
        closeModal();
    } else {
        rebuildPanes();
    }
}

function closeModal() {
    modal.hidden = true;
    openPanes = [];
    panesEl.innerHTML = '';
    document.body.style.overflow = '';
}

addPaneSelect.addEventListener('change', e => {
    const v = e.target.value;
    if (v) addPane(v);
    e.target.value = '';
});

function applySearch() {
    const q = searchEl.value.trim().toLowerCase();
    let visible = 0;
    for (const item of cardIndex) {
        const match = !q || item.filename.toLowerCase().includes(q);
        item.element.classList.toggle('hidden', !match);
        if (match) visible++;
    }
    emptyEl.hidden = visible > 0 || cardIndex.length === 0;
}

searchEl.addEventListener('input', applySearch);

sizeSelect.addEventListener('change', e => {
    grid.classList.remove('size-large', 'size-small', 'list-mode');
    const v = e.target.value;
    if (v === 'large') grid.classList.add('size-large');
    else if (v === 'small') grid.classList.add('size-small');
    else if (v === 'list') grid.classList.add('list-mode');
});

splitToggle.addEventListener('click', () => {
    splitDirection = splitDirection === 'horizontal' ? 'vertical' : 'horizontal';
    applySplitDirection();
});

// Custom modal resize handle — show a dashed ghost outline while dragging,
// only apply the real width/height on mouseup (Plan C — deferred apply).
const modalContent = document.querySelector('.modal-content');
const modalResizeHandle = document.getElementById('modalResizeHandle');

modalResizeHandle.addEventListener('mousedown', e => {
    e.preventDefault();
    const startRect = modalContent.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;

    const ghost = document.createElement('div');
    ghost.className = 'modal-resize-ghost';
    ghost.style.left = `${startRect.left}px`;
    ghost.style.top = `${startRect.top}px`;
    ghost.style.width = `${startRect.width}px`;
    ghost.style.height = `${startRect.height}px`;
    document.body.appendChild(ghost);

    document.body.style.cursor = 'nwse-resize';
    document.body.style.userSelect = 'none';
    panesEl.querySelectorAll('iframe').forEach(f => (f.style.pointerEvents = 'none'));

    let finalWidth = startRect.width;
    let finalHeight = startRect.height;

    function onMove(ev) {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        // Grow symmetrically from center: width changes by 2*dx so the cursor
        // still tracks the right edge while the left edge moves outward too.
        finalWidth = Math.max(320, Math.min(window.innerWidth, startRect.width + 2 * dx));
        finalHeight = Math.max(240, Math.min(window.innerHeight, startRect.height + 2 * dy));
        ghost.style.left = `${(window.innerWidth - finalWidth) / 2}px`;
        ghost.style.top = `${(window.innerHeight - finalHeight) / 2}px`;
        ghost.style.width = `${finalWidth}px`;
        ghost.style.height = `${finalHeight}px`;
    }

    function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        ghost.remove();
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        panesEl.querySelectorAll('iframe').forEach(f => (f.style.pointerEvents = ''));
        modalContent.style.width = `${finalWidth}px`;
        modalContent.style.height = `${finalHeight}px`;
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
});

applySplitDirection();

document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalOverlay').addEventListener('click', closeModal);
document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
});

(async () => {
    try {
        const files = await listPdfs();
        if (files.length === 0) {
            statusEl.textContent = `${PDF_DIR} 裡面還沒有 PDF 檔案。`;
            return;
        }
        statusEl.remove();
        files.sort((a, b) => a.localeCompare(b, 'zh-Hant'));
        allFiles = files;
        for (const f of files) {
            const card = makeCard(f);
            grid.appendChild(card);
            cardIndex.push({ filename: f, element: card });
        }
        applySearch();
    } catch (err) {
        console.error(err);
        statusEl.classList.add('error');
        statusEl.textContent = `載入失敗：${err.message}`;
    }
})();
