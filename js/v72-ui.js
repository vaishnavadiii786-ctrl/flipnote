// FLIPNOTE v7.2 — Official NCERT & PDF Hub UI Controller

import { escapeHtml, showToast } from './utils.js';
import { extractPdfText, saveNoteRecord } from './notes.js';
import {
  OFFICIAL_PORTALS,
  NCERT_CATALOG,
  RECOMMENDED_BOOKS,
  savePersonalPdf,
  listPersonalPdfs,
  deletePersonalPdf,
  formatBytes
} from './v72.js';

const v72State = {
  selectedClass: 'Class 12',
  selectedSubject: 'Physics Part 1',
  searchQuery: ''
};

export async function renderNcertPdfHubPanel({ onDataImported } = {}) {
  const container = document.getElementById('v6-panel-pdfs');
  if (!container) return;

  const classes = Object.keys(NCERT_CATALOG);
  if (!NCERT_CATALOG[v72State.selectedClass]) v72State.selectedClass = classes[0];
  const subjects = Object.keys(NCERT_CATALOG[v72State.selectedClass]);
  if (!subjects.includes(v72State.selectedSubject)) v72State.selectedSubject = subjects[0];

  const allChapters = NCERT_CATALOG[v72State.selectedClass][v72State.selectedSubject] || [];
  const q = v72State.searchQuery.trim().toLowerCase();
  const chapters = q
    ? allChapters.filter((c) => c.title.toLowerCase().includes(q) || `chapter ${c.chapterNo}`.includes(q))
    : allChapters;

  const lockerPdfs = await listPersonalPdfs();

  container.innerHTML = `
    <div class="glass-card v6-card" style="margin-bottom:14px;">
      <div class="v6-toolbar">
        <div>
          <span class="v6-mini-tag">100% LEGAL • OFFICIAL NCERT &amp; CBSE PORTALS</span>
          <h3 class="section-heading" style="margin:6px 0 0;">Official NCERT Chapter PDF Hub</h3>
          <p class="item-sub" style="margin:4px 0 0;">Download any Class 10 or Class 12 NCERT chapter PDF directly from official <strong>ncert.nic.in</strong> servers.</p>
        </div>
        <a class="btn btn-secondary btn-sm" href="https://ncert.nic.in/textbook.php" target="_blank" rel="noopener">🌐 All Classes (1–12) on NCERT</a>
      </div>

      <div class="v6-form-grid" style="margin-bottom:12px;">
        <div class="field-group">
          <label class="field-label" for="v72-class">Class</label>
          <select id="v72-class" class="select">
            ${classes.map((cl) => `<option value="${escapeHtml(cl)}" ${cl === v72State.selectedClass ? 'selected' : ''}>${escapeHtml(cl)}</option>`).join('')}
          </select>
        </div>
        <div class="field-group">
          <label class="field-label" for="v72-subj">Subject</label>
          <select id="v72-subj" class="select">
            ${subjects.map((s) => `<option value="${escapeHtml(s)}" ${s === v72State.selectedSubject ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
          </select>
        </div>
        <div class="field-group">
          <label class="field-label" for="v72-search">Search Chapter</label>
          <input id="v72-search" class="input" type="text" placeholder="e.g. Optics, Electricity..." value="${escapeHtml(v72State.searchQuery)}" />
        </div>
      </div>

      <div class="v72-chapter-grid">
        ${
          chapters.length
            ? chapters
                .map(
                  (ch) => `
              <div class="v72-pdf-row">
                <div>
                  <span class="v6-mini-tag">Ch ${ch.chapterNo}</span>
                  <strong style="margin-left:8px; font-size:0.93rem;">${escapeHtml(ch.title)}</strong>
                </div>
                <a class="btn btn-primary btn-sm" href="${escapeHtml(ch.pdfUrl)}" target="_blank" rel="noopener">📥 Official PDF</a>
              </div>`
                )
                .join('')
            : '<p class="item-sub">No chapters match your search.</p>'
        }
      </div>
    </div>

    <div class="glass-card v6-card" style="margin-bottom:14px;">
      <div class="v6-toolbar">
        <div>
          <span class="v6-mini-tag">PRIVATE LOCAL INDEXEDDB SHELF</span>
          <h3 class="section-heading" style="margin:6px 0 0;">Personal Offline PDF Book Locker</h3>
          <p class="item-sub" style="margin:4px 0 0;">Save your own downloaded NCERT, coaching sheets, or reference PDFs privately on your device — and convert any PDF to Smart Notes in 1 tap!</p>
        </div>
        <label class="btn btn-primary btn-sm" style="cursor:pointer;">
          <span>➕ Add PDF to My Locker</span>
          <input id="v72-locker-upload" type="file" accept="application/pdf,.pdf" hidden />
        </label>
      </div>

      ${
        !lockerPdfs.length
          ? `<div class="empty-state" style="padding:20px 12px;">
              <p class="empty-title">Your Personal PDF Locker is empty</p>
              <p class="item-sub">Upload any chapter PDF or study sheet — it stays 100% private in your browser for offline reading &amp; 1-tap Notes extraction.</p>
            </div>`
          : `<div class="v72-chapter-grid">
              ${lockerPdfs
                .map(
                  (p) => `
                <div class="v72-pdf-row">
                  <div>
                    <strong style="font-size:0.95rem;">📄 ${escapeHtml(p.title)}</strong>
                    <span class="item-sub" style="margin-left:8px;">${escapeHtml(formatBytes(p.sizeBytes))}</span>
                  </div>
                  <div class="btn-row" style="margin:0;">
                    <button class="btn btn-secondary btn-sm" data-pdf-open="${escapeHtml(p.id)}" type="button">👁️ Open PDF</button>
                    <button class="btn btn-primary btn-sm" data-pdf-extract="${escapeHtml(p.id)}" type="button">✨ Convert to Notes</button>
                    <button class="btn btn-ghost btn-sm" data-pdf-del="${escapeHtml(p.id)}" type="button" aria-label="Delete PDF">✕</button>
                  </div>
                </div>`
                )
                .join('')}
            </div>`
      }
    </div>

    <div class="glass-card v6-card">
      <h3 class="section-heading" style="margin:0 0 10px;">Official CBSE Sample Papers, NTA &amp; Reference Booklist</h3>
      <div class="v6-packs-grid">
        ${OFFICIAL_PORTALS.map(
          (portal) => `
          <article class="v6-pack-card">
            <span class="v6-mini-tag" style="align-self:flex-start;">${escapeHtml(portal.badge)}</span>
            <h4 style="margin:8px 0 6px; font-size:0.98rem;">${escapeHtml(portal.title)}</h4>
            <p class="item-sub" style="margin:0 0 12px; flex:1;">${escapeHtml(portal.desc)}</p>
            <a class="btn btn-secondary btn-sm" href="${escapeHtml(portal.url)}" target="_blank" rel="noopener">Open Official Portal ↗</a>
          </article>`
        ).join('')}
      </div>

      <h4 class="section-heading" style="margin:18px 0 8px;">Top Recommended JEE &amp; Board Books (Legal Reference List)</h4>
      <div class="v72-chapter-grid">
        ${RECOMMENDED_BOOKS.map(
          (b) => `
          <div class="v72-pdf-row">
            <div>
              <strong>${escapeHtml(b.title)}</strong>
              <span class="item-sub"> — ${escapeHtml(b.author)}</span>
            </div>
            <span class="v6-mini-tag">${escapeHtml(b.exam)}</span>
          </div>`
        ).join('')}
      </div>
    </div>
  `;

  container.querySelector('#v72-class')?.addEventListener('change', (e) => {
    v72State.selectedClass = e.target.value;
    v72State.selectedSubject = Object.keys(NCERT_CATALOG[v72State.selectedClass])[0];
    renderNcertPdfHubPanel({ onDataImported });
  });

  container.querySelector('#v72-subj')?.addEventListener('change', (e) => {
    v72State.selectedSubject = e.target.value;
    renderNcertPdfHubPanel({ onDataImported });
  });

  container.querySelector('#v72-search')?.addEventListener('input', (e) => {
    v72State.searchQuery = e.target.value;
    renderNcertPdfHubPanel({ onDataImported });
    const inp = document.getElementById('v72-search');
    if (inp) {
      inp.focus();
      inp.setSelectionRange(inp.value.length, inp.value.length);
    }
  });

  container.querySelector('#v72-locker-upload')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await savePersonalPdf({
        title: file.name.replace(/\.pdf$/i, ''),
        subject: v72State.selectedSubject,
        fileName: file.name,
        sizeBytes: file.size,
        blob: file
      });
      showToast(`Saved "${file.name}" to your Offline PDF Locker!`);
      renderNcertPdfHubPanel({ onDataImported });
    } catch (err) {
      console.error('PDF Locker save error:', err);
      showToast('Could not save PDF to local locker.');
    }
  });

  container.querySelectorAll('[data-pdf-open]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const rec = lockerPdfs.find((x) => x.id === btn.dataset.pdfOpen);
      if (!rec || !rec.blob) return;
      const url = URL.createObjectURL(rec.blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    });
  });

  container.querySelectorAll('[data-pdf-extract]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const rec = lockerPdfs.find((x) => x.id === btn.dataset.pdfExtract);
      if (!rec || !rec.blob) return;
      btn.disabled = true;
      btn.textContent = 'Extracting...';
      try {
        const text = await extractPdfText(rec.blob);
        if (!text || text.trim().length < 20) {
          showToast('Could not extract selectable text from this PDF.');
          btn.disabled = false;
          btn.textContent = '✨ Convert to Notes';
          return;
        }
        await saveNoteRecord({
          title: rec.title,
          subject: rec.subject || 'General',
          content: text.slice(0, 18000),
          language: 'en'
        });
        if (typeof onDataImported === 'function') await onDataImported();
        showToast(`Extracted "${rec.title}" into Smart Notes & Formula Sheet!`);
      } catch (err) {
        console.error('PDF extract error:', err);
        showToast('PDF text extraction failed. Try opening it in Notes view.');
      }
      btn.disabled = false;
      btn.textContent = '✨ Convert to Notes';
    });
  });

  container.querySelectorAll('[data-pdf-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await deletePersonalPdf(btn.dataset.pdfDel);
      showToast('Removed PDF from locker.');
      renderNcertPdfHubPanel({ onDataImported });
    });
  });
}
