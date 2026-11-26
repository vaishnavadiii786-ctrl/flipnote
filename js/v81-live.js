// FLIPNOTE v8.1 — Student Live Sync (Notices, Lectures, NCERT PDFs, Topper Notes, Live Quizzes)
// Fetches published content from Supabase with offline localStorage cache fallback.

import { DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY } from './supabase.js';

const CACHE_KEY = 'flipnote_v81_live_cache_v1';

const liveState = {
  tab: 'lectures',
  search: '',
  subject: 'all',
  dismissedNoticeIds: new Set(),
  data: {
    notices: [],
    lectures: [],
    ncert_pdfs: [],
    topper_notes: [],
    quizzes: [],
    syncedAt: null
  },
  activeQuiz: null,
  quizAnswers: {}
};

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getSbConfig() {
  let url = DEFAULT_SUPABASE_URL;
  let key = DEFAULT_SUPABASE_ANON_KEY;
  try {
    const raw = localStorage.getItem('flipnote_settings');
    if (raw) {
      const s = JSON.parse(raw);
      if (s.supabaseUrl) url = s.supabaseUrl.trim().replace(/\/+$/, '');
      if (s.supabaseAnonKey) key = s.supabaseAnonKey.trim();
    }
  } catch (_) {}
  return { url, key };
}

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      liveState.data = { ...liveState.data, ...parsed };
    }
  } catch (_) {}
}

function saveCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(liveState.data));
  } catch (_) {}
}

async function sbSelect(table, query) {
  const { url, key } = getSbConfig();
  const headers = { 'apikey': key };
  if (key.startsWith('eyJ')) headers['Authorization'] = `Bearer ${key}`;
  const res = await fetch(`${url}/rest/v1/${table}?${query}`, { headers });
  if (!res.ok) return null;
  return res.json();
}

export async function syncLiveContent() {
  if (!navigator.onLine) {
    renderNoticeBanner();
    renderLiveHub();
    return;
  }

  try {
    const [notices, lectures, ncert, notes, quizzes] = await Promise.all([
      sbSelect('live_notices', 'select=id,badge,title,message,cta_label,cta_url,tone,priority,created_at&is_active=eq.true&order=priority.desc,created_at.desc&limit=10'),
      sbSelect('live_lectures', 'select=id,title,subject,chapter,batch,teacher,video_url,duration,created_at&is_published=eq.true&order=created_at.desc&limit=100'),
      sbSelect('live_ncert_pdfs', 'select=id,class_level,subject,chapter,pdf_url,created_at&is_published=eq.true&order=created_at.desc&limit=150'),
      sbSelect('live_topper_notes', 'select=id,title,subject,chapter,exam_tag,pdf_url,summary_md,created_at&is_published=eq.true&order=created_at.desc&limit=100'),
      sbSelect('live_quizzes', 'select=id,title,subject,exam_tag,duration_min,questions,created_at&is_published=eq.true&order=created_at.desc&limit=50')
    ]);

    if (Array.isArray(notices)) liveState.data.notices = notices;
    if (Array.isArray(lectures)) liveState.data.lectures = lectures;
    if (Array.isArray(ncert)) liveState.data.ncert_pdfs = ncert;
    if (Array.isArray(notes)) liveState.data.topper_notes = notes;
    if (Array.isArray(quizzes)) liveState.data.quizzes = quizzes;
    liveState.data.syncedAt = new Date().toISOString();
    saveCache();
  } catch (_) {
    // Silent offline/unconfigured fallback
  }

  renderNoticeBanner();
  renderLiveHub();
}

function renderNoticeBanner() {
  const host = document.getElementById('v81-notice-banner');
  if (!host) return;
  const active = (liveState.data.notices || []).filter((n) => !liveState.dismissedNoticeIds.has(n.id));
  if (!active.length) {
    host.hidden = true;
    host.innerHTML = '';
    return;
  }
  const n = active[0];
  const toneClass = n.tone === 'amber' ? 'v81-notice-amber' : (n.tone === 'crimson' ? 'v81-notice-crimson' : 'v81-notice-emerald');
  host.className = `v81-notice-banner ${toneClass}`;
  host.hidden = false;
  host.innerHTML = `
    <div class="v81-notice-left">
      <span class="v81-notice-badge">${esc(n.badge || 'LIVE')}</span>
      <div>
        <strong>${esc(n.title)}</strong>
        <span class="v81-notice-msg"> — ${esc(n.message)}</span>
      </div>
    </div>
    <div class="v81-notice-actions">
      ${n.cta_url ? `<a class="btn btn-primary btn-sm" href="${esc(n.cta_url)}" target="_blank" rel="noopener noreferrer">${esc(n.cta_label || 'Open')} ↗</a>` : ''}
      <button type="button" class="btn btn-ghost btn-sm" id="v81-notice-dismiss" aria-label="Dismiss notice">✕</button>
    </div>
  `;
  document.getElementById('v81-notice-dismiss')?.addEventListener('click', () => {
    liveState.dismissedNoticeIds.add(n.id);
    renderNoticeBanner();
  });
}

function getYouTubeEmbed(url) {
  if (!url) return '';
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  return m ? `https://www.youtube.com/embed/${m[1]}?autoplay=1` : '';
}

function openVideoModal(lec) {
  const modal = document.getElementById('v81-content-modal');
  const titleEl = document.getElementById('v81-modal-title');
  const bodyEl = document.getElementById('v81-modal-body');
  if (!modal || !bodyEl) return;

  titleEl.textContent = lec.title;
  const yt = getYouTubeEmbed(lec.video_url);
  if (yt) {
    bodyEl.innerHTML = `
      <div style="position:relative;padding-top:56.25%;border-radius:14px;overflow:hidden;background:#000;margin-bottom:12px;">
        <iframe src="${esc(yt)}" style="position:absolute;inset:0;width:100%;height:100%;border:0;" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>
      </div>
      <p class="item-sub">${esc(lec.subject)} • ${esc(lec.batch || '')} • ${esc(lec.teacher || '')}</p>
    `;
  } else {
    bodyEl.innerHTML = `
      <video controls autoplay style="width:100%;border-radius:14px;background:#000;max-height:60vh;margin-bottom:12px;" src="${esc(lec.video_url)}"></video>
      <div class="btn-row" style="justify-content:space-between;">
        <span class="item-sub">${esc(lec.subject)} • ${esc(lec.teacher || '')}</span>
        <a class="btn btn-primary btn-sm" href="${esc(lec.video_url)}" target="_blank" rel="noopener noreferrer">Open External ↗</a>
      </div>
    `;
  }
  modal.hidden = false;
}

function openNoteModal(note) {
  const modal = document.getElementById('v81-content-modal');
  const titleEl = document.getElementById('v81-modal-title');
  const bodyEl = document.getElementById('v81-modal-body');
  if (!modal || !bodyEl) return;

  titleEl.textContent = note.title;
  bodyEl.innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
      <span class="pill">${esc(note.subject)}</span>
      ${note.chapter ? `<span class="pill">${esc(note.chapter)}</span>` : ''}
      ${note.exam_tag ? `<span class="pill">${esc(note.exam_tag)}</span>` : ''}
    </div>
    ${note.summary_md ? `<div class="v81-note-reader">${esc(note.summary_md).replace(/\n/g, '<br>')}</div>` : '<p class="item-sub">Open the attached Topper Notes PDF below.</p>'}
    ${note.pdf_url ? `<div style="margin-top:14px;"><a class="btn btn-primary" href="${esc(note.pdf_url)}" target="_blank" rel="noopener noreferrer">Open Topper PDF ↗</a></div>` : ''}
  `;
  modal.hidden = false;
}

function openQuizModal(quiz) {
  const qs = Array.isArray(quiz.questions) ? quiz.questions : [];
  if (!qs.length) return;
  liveState.activeQuiz = quiz;
  liveState.quizAnswers = {};
  renderQuizBody();
  document.getElementById('v81-content-modal').hidden = false;
}

function renderQuizBody(submitted = false) {
  const quiz = liveState.activeQuiz;
  const titleEl = document.getElementById('v81-modal-title');
  const bodyEl = document.getElementById('v81-modal-body');
  if (!quiz || !bodyEl) return;

  const qs = quiz.questions || [];
  titleEl.textContent = `${quiz.title} (${qs.length} Qs)`;

  let score = 0;
  if (submitted) {
    qs.forEach((q, idx) => {
      if (Number(liveState.quizAnswers[idx]) === Number(q.answer)) score++;
    });
  }

  bodyEl.innerHTML = `
    ${submitted ? `<div class="glass-card" style="padding:12px 16px;margin-bottom:14px;border-color:rgba(52,211,153,0.5);"><strong>Score: ${score} / ${qs.length}</strong> (${Math.round((score / qs.length) * 100)}%)</div>` : ''}
    <div style="max-height:56vh;overflow-y:auto;display:grid;gap:12px;padding-right:4px;">
      ${qs.map((q, idx) => {
        const chosen = liveState.quizAnswers[idx];
        return `
          <div class="glass-card" style="padding:14px;">
            <p style="margin:0 0 8px;font-weight:700;">Q${idx + 1}. ${esc(q.q || q.question || '')}</p>
            <div style="display:grid;gap:6px;">
              ${(q.options || []).map((opt, oi) => {
                const isSel = Number(chosen) === oi;
                const isCorr = Number(q.answer) === oi;
                let style = '';
                if (submitted) {
                  if (isCorr) style = 'border-color:#10b981;background:rgba(16,185,129,0.2);';
                  else if (isSel) style = 'border-color:#ef4444;background:rgba(239,68,68,0.18);';
                } else if (isSel) {
                  style = 'border-color:#34d399;background:rgba(16,185,129,0.15);';
                }
                return `<button type="button" class="btn btn-secondary btn-sm v81-q-opt" data-qi="${idx}" data-oi="${oi}" style="justify-content:flex-start;text-align:left;${style}" ${submitted ? 'disabled' : ''}>${esc(opt)}</button>`;
              }).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
    <div class="btn-row" style="margin-top:14px;justify-content:flex-end;">
      ${!submitted ? '<button type="button" id="v81-quiz-submit" class="btn btn-primary">Submit Quiz</button>' : '<button type="button" id="v81-quiz-retry" class="btn btn-secondary">Retry</button>'}
    </div>
  `;

  bodyEl.querySelectorAll('.v81-q-opt').forEach((btn) => {
    btn.addEventListener('click', () => {
      liveState.quizAnswers[Number(btn.dataset.qi)] = Number(btn.dataset.oi);
      renderQuizBody(false);
    });
  });
  document.getElementById('v81-quiz-submit')?.addEventListener('click', () => renderQuizBody(true));
  document.getElementById('v81-quiz-retry')?.addEventListener('click', () => {
    liveState.quizAnswers = {};
    renderQuizBody(false);
  });
}

function renderLiveHub() {
  const listEl = document.getElementById('v81-live-list');
  const syncEl = document.getElementById('v81-live-sync-label');
  if (!listEl) return;

  if (syncEl) {
    syncEl.textContent = liveState.data.syncedAt
      ? `Live Synced • ${new Date(liveState.data.syncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      : 'Offline Cache Ready';
  }

  const q = liveState.search.trim().toLowerCase();
  const sub = liveState.subject;

  const filterFn = (item, fields) => {
    if (sub !== 'all' && (item.subject || '').toLowerCase() !== sub) return false;
    if (!q) return true;
    return fields.some((f) => String(item[f] || '').toLowerCase().includes(q));
  };

  if (liveState.tab === 'lectures') {
    const items = (liveState.data.lectures || []).filter((x) => filterFn(x, ['title', 'subject', 'chapter', 'batch', 'teacher']));
    if (!items.length) {
      listEl.innerHTML = '<div class="glass-card empty-state"><p>No live lectures published yet. Add lectures from Admin Panel (<code>/admin.html</code>).</p></div>';
      return;
    }
    listEl.innerHTML = items.map((l) => `
      <article class="glass-card v81-item-card">
        <div class="v81-item-meta">
          <span class="pill">${esc(l.subject)}</span>
          ${l.batch ? `<span class="pill">${esc(l.batch)}</span>` : ''}
          ${l.duration ? `<span class="item-sub">${esc(l.duration)}</span>` : ''}
        </div>
        <h3 style="margin:6px 0 4px;">${esc(l.title)}</h3>
        <p class="item-sub" style="margin:0 0 12px;">${esc(l.chapter || 'Full Chapter')} • ${esc(l.teacher || 'FLIPNOTE Faculty')}</p>
        <button type="button" class="btn btn-primary btn-sm v81-watch-btn" data-id="${esc(l.id)}">▶ Watch Lecture</button>
      </article>
    `).join('');
    listEl.querySelectorAll('.v81-watch-btn').forEach((b) => {
      b.addEventListener('click', () => {
        const lec = items.find((x) => x.id === b.dataset.id);
        if (lec) openVideoModal(lec);
      });
    });
  } else if (liveState.tab === 'ncert') {
    const items = (liveState.data.ncert_pdfs || []).filter((x) => filterFn(x, ['class_level', 'subject', 'chapter']));
    if (!items.length) {
      listEl.innerHTML = '<div class="glass-card empty-state"><p>No live NCERT PDFs added yet. Publish PDFs via Admin Panel.</p></div>';
      return;
    }
    listEl.innerHTML = items.map((p) => `
      <article class="glass-card v81-item-card">
        <div class="v81-item-meta">
          <span class="pill">${esc(p.class_level)}</span>
          <span class="pill">${esc(p.subject)}</span>
        </div>
        <h3 style="margin:6px 0 10px;">${esc(p.chapter)}</h3>
        <a class="btn btn-primary btn-sm" href="${esc(p.pdf_url)}" target="_blank" rel="noopener noreferrer">Open NCERT PDF ↗</a>
      </article>
    `).join('');
  } else if (liveState.tab === 'notes') {
    const items = (liveState.data.topper_notes || []).filter((x) => filterFn(x, ['title', 'subject', 'chapter', 'exam_tag']));
    if (!items.length) {
      listEl.innerHTML = '<div class="glass-card empty-state"><p>No Topper Notes published yet. Add notes via Admin Panel.</p></div>';
      return;
    }
    listEl.innerHTML = items.map((n) => `
      <article class="glass-card v81-item-card">
        <div class="v81-item-meta">
          <span class="pill">${esc(n.subject)}</span>
          ${n.exam_tag ? `<span class="pill">${esc(n.exam_tag)}</span>` : ''}
        </div>
        <h3 style="margin:6px 0 4px;">${esc(n.title)}</h3>
        <p class="item-sub" style="margin:0 0 12px;">${esc(n.chapter || 'High-Yield Topper Notes')}</p>
        <button type="button" class="btn btn-primary btn-sm v81-read-note" data-id="${esc(n.id)}">Read Topper Notes</button>
      </article>
    `).join('');
    listEl.querySelectorAll('.v81-read-note').forEach((b) => {
      b.addEventListener('click', () => {
        const note = items.find((x) => x.id === b.dataset.id);
        if (note) openNoteModal(note);
      });
    });
  } else {
    const items = (liveState.data.quizzes || []).filter((x) => filterFn(x, ['title', 'subject', 'exam_tag']));
    if (!items.length) {
      listEl.innerHTML = '<div class="glass-card empty-state"><p>No Live Quizzes published yet. Create quizzes in Admin Panel.</p></div>';
      return;
    }
    listEl.innerHTML = items.map((qz) => `
      <article class="glass-card v81-item-card">
        <div class="v81-item-meta">
          <span class="pill">${esc(qz.subject)}</span>
          <span class="pill">${(qz.questions || []).length} Qs • ${qz.duration_min || 15}m</span>
        </div>
        <h3 style="margin:6px 0 10px;">${esc(qz.title)}</h3>
        <button type="button" class="btn btn-primary btn-sm v81-start-quiz" data-id="${esc(qz.id)}">⚡ Start Live Quiz</button>
      </article>
    `).join('');
    listEl.querySelectorAll('.v81-start-quiz').forEach((b) => {
      b.addEventListener('click', () => {
        const qz = items.find((x) => x.id === b.dataset.id);
        if (qz) openQuizModal(qz);
      });
    });
  }
}

export function initLiveHub() {
  loadCache();
  renderNoticeBanner();
  renderLiveHub();

  document.querySelectorAll('[data-v81-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      liveState.tab = btn.getAttribute('data-v81-tab');
      document.querySelectorAll('[data-v81-tab]').forEach((b) => b.classList.toggle('active', b === btn));
      renderLiveHub();
    });
  });

  document.getElementById('v81-live-search')?.addEventListener('input', (e) => {
    liveState.search = e.target.value;
    renderLiveHub();
  });
  document.getElementById('v81-live-subject')?.addEventListener('change', (e) => {
    liveState.subject = e.target.value;
    renderLiveHub();
  });
  document.getElementById('v81-btn-refresh-live')?.addEventListener('click', syncLiveContent);
  document.getElementById('v81-modal-close')?.addEventListener('click', () => {
    const m = document.getElementById('v81-content-modal');
    if (m) m.hidden = true;
    const body = document.getElementById('v81-modal-body');
    if (body) body.innerHTML = '';
  });

  syncLiveContent();
  setInterval(syncLiveContent, 45000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLiveHub);
} else {
  initLiveHub();
}
