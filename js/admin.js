// FLIPNOTE v8.1 — PW-Style Password-Protected Live Admin Panel
// Communicates with Supabase via secure SECURITY DEFINER RPCs (pgcrypto password hash).

import { DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY } from './supabase.js';

const SESSION_KEY = 'flipnote_v81_admin_pw_session';

const state = {
  supabaseUrl: DEFAULT_SUPABASE_URL,
  anonKey: DEFAULT_SUPABASE_ANON_KEY,
  password: '',
  activeTab: 'notices',
  refreshSec: 10,
  timerId: null,
  search: '',
  lastSync: null,
  data: {
    notices: [],
    lectures: [],
    ncert_pdfs: [],
    topper_notes: [],
    quizzes: [],
    users: []
  }
};

const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toast(msg, isErr = false) {
  const el = $('admin-toast');
  if (!el) return;
  el.textContent = msg;
  el.className = `admin-toast show ${isErr ? 'err' : 'ok'}`;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = 'admin-toast'; }, 3200);
}

async function rpc(fnName, params = {}) {
  const base = state.supabaseUrl.replace(/\/+$/, '');
  const headers = {
    'Content-Type': 'application/json',
    'apikey': state.anonKey
  };
  if (state.anonKey.startsWith('eyJ')) headers['Authorization'] = `Bearer ${state.anonKey}`;
  const res = await fetch(`${base}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(params)
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch (_) { parsed = text; }
  if (!res.ok) {
    const msg = parsed?.message || parsed?.hint || text || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return parsed;
}

function saveSession() {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      supabaseUrl: state.supabaseUrl,
      anonKey: state.anonKey,
      password: state.password
    }));
  } catch (_) {}
}

function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    if (s.supabaseUrl) state.supabaseUrl = s.supabaseUrl;
    if (s.anonKey) state.anonKey = s.anonKey;
    state.password = s.password || '';
    return Boolean(state.password);
  } catch (_) {
    return false;
  }
}

function clearSession() {
  state.password = '';
  stopAutoRefresh();
  try { sessionStorage.removeItem(SESSION_KEY); } catch (_) {}
}

async function syncDashboard() {
  const dot = $('live-dot');
  if (dot) dot.classList.add('syncing');
  try {
    const res = await rpc('admin_get_dashboard', { p_password: state.password });
    if (res && typeof res === 'object') {
      state.data = {
        notices: res.notices || [],
        lectures: res.lectures || [],
        ncert_pdfs: res.ncert_pdfs || [],
        topper_notes: res.topper_notes || [],
        quizzes: res.quizzes || [],
        users: res.users || []
      };
      state.lastSync = new Date();
      renderAll();
    }
  } catch (err) {
    toast(`Sync failed: ${err.message}`, true);
  } finally {
    if (dot) dot.classList.remove('syncing');
  }
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true
  });
}

function renderAll() {
  $('kpi-notices').textContent = state.data.notices.filter((x) => x.is_active).length;
  $('kpi-lectures').textContent = state.data.lectures.length;
  $('kpi-ncert').textContent = state.data.ncert_pdfs.length;
  $('kpi-notes').textContent = state.data.topper_notes.length;
  $('kpi-quizzes').textContent = state.data.quizzes.length;
  $('kpi-users').textContent = state.data.users.length;

  if (state.lastSync) {
    $('last-sync-time').textContent = `Live • ${state.lastSync.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
  }
  renderTable();
}

function renderTable() {
  const q = state.search.trim().toLowerCase();
  const thead = $('table-head');
  const tbody = $('table-body');
  const addBtn = $('btn-add-item');
  const csvBtn = $('btn-export-csv');

  addBtn.hidden = state.activeTab === 'users';
  csvBtn.hidden = state.activeTab !== 'users';

  if (state.activeTab === 'notices') {
    addBtn.textContent = '+ New Notice Banner';
    thead.innerHTML = '<tr><th>Badge &amp; Title</th><th>Message</th><th>Tone</th><th>Status</th><th style="text-align:right;">Actions</th></tr>';
    const rows = state.data.notices.filter((x) => !q || (x.title + x.message + x.badge).toLowerCase().includes(q));
    tbody.innerHTML = rows.length ? rows.map((n) => `
      <tr>
        <td><span class="pill-mini ok">${esc(n.badge)}</span> <strong>${esc(n.title)}</strong></td>
        <td class="muted">${esc(n.message)}</td>
        <td><span class="pill-mini">${esc(n.tone)}</span></td>
        <td><span class="pill-mini ${n.is_active ? 'ok' : 'warn'}">${n.is_active ? 'Active' : 'Paused'}</span></td>
        <td class="act-cell">
          <button class="btn-xs" data-act="edit" data-id="${esc(n.id)}">Edit</button>
          <button class="btn-xs" data-act="toggle" data-id="${esc(n.id)}">${n.is_active ? 'Pause' : 'Activate'}</button>
          <button class="btn-xs danger" data-act="del" data-table="live_notices" data-id="${esc(n.id)}">Delete</button>
        </td>
      </tr>
    `).join('') : '<tr><td colspan="5" class="empty-cell">No notice banners yet. Click "+ New Notice Banner" to publish one live.</td></tr>';
  } else if (state.activeTab === 'lectures') {
    addBtn.textContent = '+ Add Lecture';
    thead.innerHTML = '<tr><th>Lecture Title</th><th>Subject / Batch</th><th>Teacher</th><th>Status</th><th style="text-align:right;">Actions</th></tr>';
    const rows = state.data.lectures.filter((x) => !q || (x.title + x.subject + x.chapter + x.batch).toLowerCase().includes(q));
    tbody.innerHTML = rows.length ? rows.map((l) => `
      <tr>
        <td><strong>${esc(l.title)}</strong><div class="muted">${esc(l.chapter || '')} ${l.duration ? '• ' + esc(l.duration) : ''}</div></td>
        <td><span class="pill-mini ok">${esc(l.subject)}</span> <span class="muted">${esc(l.batch)}</span></td>
        <td class="muted">${esc(l.teacher)}</td>
        <td><span class="pill-mini ${l.is_published ? 'ok' : 'warn'}">${l.is_published ? 'Live' : 'Draft'}</span></td>
        <td class="act-cell">
          <button class="btn-xs" data-act="edit" data-id="${esc(l.id)}">Edit</button>
          <button class="btn-xs" data-act="toggle" data-id="${esc(l.id)}">${l.is_published ? 'Hide' : 'Publish'}</button>
          <button class="btn-xs danger" data-act="del" data-table="live_lectures" data-id="${esc(l.id)}">Delete</button>
        </td>
      </tr>
    `).join('') : '<tr><td colspan="5" class="empty-cell">No lectures yet. Click "+ Add Lecture" to push live.</td></tr>';
  } else if (state.activeTab === 'ncert') {
    addBtn.textContent = '+ Add NCERT PDF';
    thead.innerHTML = '<tr><th>Class &amp; Subject</th><th>Chapter</th><th>Status</th><th style="text-align:right;">Actions</th></tr>';
    const rows = state.data.ncert_pdfs.filter((x) => !q || (x.class_level + x.subject + x.chapter).toLowerCase().includes(q));
    tbody.innerHTML = rows.length ? rows.map((p) => `
      <tr>
        <td><span class="pill-mini ok">${esc(p.class_level)}</span> <strong>${esc(p.subject)}</strong></td>
        <td>${esc(p.chapter)}</td>
        <td><span class="pill-mini ${p.is_published ? 'ok' : 'warn'}">${p.is_published ? 'Live' : 'Hidden'}</span></td>
        <td class="act-cell">
          <button class="btn-xs" data-act="edit" data-id="${esc(p.id)}">Edit</button>
          <button class="btn-xs" data-act="toggle" data-id="${esc(p.id)}">${p.is_published ? 'Hide' : 'Publish'}</button>
          <button class="btn-xs danger" data-act="del" data-table="live_ncert_pdfs" data-id="${esc(p.id)}">Delete</button>
        </td>
      </tr>
    `).join('') : '<tr><td colspan="4" class="empty-cell">No NCERT PDFs yet. Click "+ Add NCERT PDF" to add one.</td></tr>';
  } else if (state.activeTab === 'notes') {
    addBtn.textContent = '+ Add Topper Notes';
    thead.innerHTML = '<tr><th>Title &amp; Chapter</th><th>Subject / Exam</th><th>Status</th><th style="text-align:right;">Actions</th></tr>';
    const rows = state.data.topper_notes.filter((x) => !q || (x.title + x.subject + x.chapter + x.exam_tag).toLowerCase().includes(q));
    tbody.innerHTML = rows.length ? rows.map((n) => `
      <tr>
        <td><strong>${esc(n.title)}</strong><div class="muted">${esc(n.chapter || '')}</div></td>
        <td><span class="pill-mini ok">${esc(n.subject)}</span> <span class="muted">${esc(n.exam_tag)}</span></td>
        <td><span class="pill-mini ${n.is_published ? 'ok' : 'warn'}">${n.is_published ? 'Live' : 'Draft'}</span></td>
        <td class="act-cell">
          <button class="btn-xs" data-act="edit" data-id="${esc(n.id)}">Edit</button>
          <button class="btn-xs" data-act="toggle" data-id="${esc(n.id)}">${n.is_published ? 'Hide' : 'Publish'}</button>
          <button class="btn-xs danger" data-act="del" data-table="live_topper_notes" data-id="${esc(n.id)}">Delete</button>
        </td>
      </tr>
    `).join('') : '<tr><td colspan="4" class="empty-cell">No topper notes yet. Click "+ Add Topper Notes" to publish.</td></tr>';
  } else if (state.activeTab === 'quizzes') {
    addBtn.textContent = '+ Create Live Quiz';
    thead.innerHTML = '<tr><th>Quiz Title</th><th>Subject / Tag</th><th>Questions</th><th>Status</th><th style="text-align:right;">Actions</th></tr>';
    const rows = state.data.quizzes.filter((x) => !q || (x.title + x.subject + x.exam_tag).toLowerCase().includes(q));
    tbody.innerHTML = rows.length ? rows.map((qz) => `
      <tr>
        <td><strong>${esc(qz.title)}</strong></td>
        <td><span class="pill-mini ok">${esc(qz.subject)}</span> <span class="muted">${esc(qz.exam_tag)}</span></td>
        <td>${(qz.questions || []).length} Qs • ${qz.duration_min || 15}m</td>
        <td><span class="pill-mini ${qz.is_published ? 'ok' : 'warn'}">${qz.is_published ? 'Live' : 'Draft'}</span></td>
        <td class="act-cell">
          <button class="btn-xs" data-act="edit" data-id="${esc(qz.id)}">Edit</button>
          <button class="btn-xs" data-act="toggle" data-id="${esc(qz.id)}">${qz.is_published ? 'Hide' : 'Publish'}</button>
          <button class="btn-xs danger" data-act="del" data-table="live_quizzes" data-id="${esc(qz.id)}">Delete</button>
        </td>
      </tr>
    `).join('') : '<tr><td colspan="5" class="empty-cell">No live quizzes yet. Click "+ Create Live Quiz" to publish.</td></tr>';
  } else {
    thead.innerHTML = '<tr><th>Name</th><th>Email</th><th>Lang</th><th>Joined</th><th style="text-align:right;">Actions</th></tr>';
    const rows = state.data.users.filter((u) => !q || (u.full_name + u.email + u.language).toLowerCase().includes(q));
    tbody.innerHTML = rows.length ? rows.map((u) => `
      <tr>
        <td><strong>${esc(u.full_name)}</strong></td>
        <td class="mono">${esc(u.email)}</td>
        <td><span class="pill-mini">${esc((u.language || 'en').toUpperCase())}</span></td>
        <td class="muted">${esc(fmtDate(u.created_at))}</td>
        <td class="act-cell">
          <button class="btn-xs danger" data-act="del" data-table="app_users" data-id="${esc(u.id)}">Delete</button>
        </td>
      </tr>
    `).join('') : '<tr><td colspan="5" class="empty-cell">No registered users found.</td></tr>';
  }
}

function openEditorModal(item = null) {
  const tab = state.activeTab;
  const modal = $('editor-modal');
  const titleEl = $('editor-title');
  const formFields = $('editor-fields');
  $('editor-id').value = item?.id || '';

  if (tab === 'notices') {
    titleEl.textContent = item ? 'Edit Notice Banner' : 'Publish Live Notice Banner';
    formFields.innerHTML = `
      <div class="grid-2">
        <div class="field"><label>Badge</label><input id="f-badge" class="input" value="${esc(item?.badge || 'NEW')}" required /></div>
        <div class="field"><label>Tone</label><select id="f-tone" class="select"><option value="emerald">Emerald (Default)</option><option value="amber">Amber (Alert)</option><option value="crimson">Crimson (Urgent)</option></select></div>
      </div>
      <div class="field"><label>Headline Title</label><input id="f-title" class="input" value="${esc(item?.title || '')}" placeholder="e.g. JEE Main 2027 Crash Batch Live!" required /></div>
      <div class="field"><label>Message</label><textarea id="f-msg" class="input" rows="2" required>${esc(item?.message || '')}</textarea></div>
      <div class="grid-2">
        <div class="field"><label>CTA Button Label (Optional)</label><input id="f-cta-lbl" class="input" value="${esc(item?.cta_label || '')}" placeholder="Open Now" /></div>
        <div class="field"><label>CTA URL (Optional)</label><input id="f-cta-url" class="input" value="${esc(item?.cta_url || '')}" placeholder="https://..." /></div>
      </div>
      <div class="grid-2">
        <div class="field"><label>Priority</label><input id="f-prio" class="input" type="number" value="${item?.priority ?? 1}" /></div>
        <div class="field"><label>Active</label><select id="f-active" class="select"><option value="true">Active (Visible)</option><option value="false">Paused</option></select></div>
      </div>
    `;
    if (item) { $('f-tone').value = item.tone || 'emerald'; $('f-active').value = String(item.is_active); }
  } else if (tab === 'lectures') {
    titleEl.textContent = item ? 'Edit Lecture' : 'Add Live Lecture';
    formFields.innerHTML = `
      <div class="field"><label>Lecture Title</label><input id="f-title" class="input" value="${esc(item?.title || '')}" placeholder="Electrostatics L1 — Gauss Law" required /></div>
      <div class="grid-2">
        <div class="field"><label>Subject</label><input id="f-sub" class="input" value="${esc(item?.subject || 'Physics')}" required /></div>
        <div class="field"><label>Chapter</label><input id="f-chap" class="input" value="${esc(item?.chapter || '')}" placeholder="Chapter 1" /></div>
      </div>
      <div class="grid-2">
        <div class="field"><label>Batch</label><input id="f-batch" class="input" value="${esc(item?.batch || 'JEE / NEET')}" /></div>
        <div class="field"><label>Teacher</label><input id="f-teacher" class="input" value="${esc(item?.teacher || 'FLIPNOTE Faculty')}" /></div>
      </div>
      <div class="grid-2">
        <div class="field"><label>Video / YouTube URL</label><input id="f-url" class="input" type="url" value="${esc(item?.video_url || '')}" placeholder="https://youtube.com/watch?v=..." required /></div>
        <div class="field"><label>Duration</label><input id="f-dur" class="input" value="${esc(item?.duration || '')}" placeholder="45 min" /></div>
      </div>
      <div class="field"><label>Status</label><select id="f-pub" class="select"><option value="true">Published (Live)</option><option value="false">Draft</option></select></div>
    `;
    if (item) $('f-pub').value = String(item.is_published);
  } else if (tab === 'ncert') {
    titleEl.textContent = item ? 'Edit NCERT PDF' : 'Add Live NCERT PDF';
    formFields.innerHTML = `
      <div class="grid-2">
        <div class="field"><label>Class</label><input id="f-cls" class="input" value="${esc(item?.class_level || 'Class 12')}" required /></div>
        <div class="field"><label>Subject</label><input id="f-sub" class="input" value="${esc(item?.subject || 'Physics')}" required /></div>
      </div>
      <div class="field"><label>Chapter Name</label><input id="f-chap" class="input" value="${esc(item?.chapter || '')}" placeholder="Ch 01: Electric Charges & Fields" required /></div>
      <div class="field"><label>PDF URL</label><input id="f-url" class="input" type="url" value="${esc(item?.pdf_url || '')}" placeholder="https://ncert.nic.in/..." required /></div>
      <div class="field"><label>Status</label><select id="f-pub" class="select"><option value="true">Published (Live)</option><option value="false">Hidden</option></select></div>
    `;
    if (item) $('f-pub').value = String(item.is_published);
  } else if (tab === 'notes') {
    titleEl.textContent = item ? 'Edit Topper Notes' : 'Add Live Topper Notes';
    formFields.innerHTML = `
      <div class="field"><label>Notes Title</label><input id="f-title" class="input" value="${esc(item?.title || '')}" placeholder="Organic Chemistry — Named Reactions" required /></div>
      <div class="grid-2">
        <div class="field"><label>Subject</label><input id="f-sub" class="input" value="${esc(item?.subject || 'Chemistry')}" required /></div>
        <div class="field"><label>Chapter</label><input id="f-chap" class="input" value="${esc(item?.chapter || '')}" /></div>
      </div>
      <div class="grid-2">
        <div class="field"><label>Exam Tag</label><input id="f-tag" class="input" value="${esc(item?.exam_tag || 'JEE / NEET')}" /></div>
        <div class="field"><label>PDF URL (Optional)</label><input id="f-url" class="input" type="url" value="${esc(item?.pdf_url || '')}" placeholder="https://..." /></div>
      </div>
      <div class="field"><label>Inline Summary / Topper Notes Text</label><textarea id="f-sum" class="input" rows="4" placeholder="Write key formulas, tricks, or topper points...">${esc(item?.summary_md || '')}</textarea></div>
      <div class="field"><label>Status</label><select id="f-pub" class="select"><option value="true">Published (Live)</option><option value="false">Draft</option></select></div>
    `;
    if (item) $('f-pub').value = String(item.is_published);
  } else if (tab === 'quizzes') {
    titleEl.textContent = item ? 'Edit Live Quiz' : 'Create Live Quiz';
    const sampleQ = JSON.stringify(item?.questions || [
      { q: 'SI unit of Electric Flux is:', options: ['N·m²/C', 'N/C', 'V/m', 'J/C'], answer: 0 }
    ], null, 2);
    formFields.innerHTML = `
      <div class="field"><label>Quiz Title</label><input id="f-title" class="input" value="${esc(item?.title || '')}" placeholder="Physics Daily Practice #1" required /></div>
      <div class="grid-2">
        <div class="field"><label>Subject</label><input id="f-sub" class="input" value="${esc(item?.subject || 'Physics')}" required /></div>
        <div class="field"><label>Exam Tag</label><input id="f-tag" class="input" value="${esc(item?.exam_tag || 'JEE / NEET')}" /></div>
      </div>
      <div class="grid-2">
        <div class="field"><label>Duration (Min)</label><input id="f-dur" class="input" type="number" value="${item?.duration_min ?? 15}" /></div>
        <div class="field"><label>Status</label><select id="f-pub" class="select"><option value="true">Published (Live)</option><option value="false">Draft</option></select></div>
      </div>
      <div class="field"><label>Questions JSON (array of {q, options[], answer index 0-3})</label><textarea id="f-qs" class="input mono" rows="7" required>${esc(sampleQ)}</textarea></div>
    `;
    if (item) $('f-pub').value = String(item.is_published);
  }

  modal.hidden = false;
}

async function handleEditorSubmit(e) {
  e.preventDefault();
  const id = $('editor-id').value || null;
  const tab = state.activeTab;
  const btn = $('editor-save-btn');
  btn.disabled = true;

  try {
    if (tab === 'notices') {
      await rpc('admin_save_notice', {
        p_password: state.password, p_id: id,
        p_badge: $('f-badge').value.trim(), p_title: $('f-title').value.trim(),
        p_message: $('f-msg').value.trim(), p_cta_label: $('f-cta-lbl').value.trim(),
        p_cta_url: $('f-cta-url').value.trim(), p_tone: $('f-tone').value,
        p_priority: Number($('f-prio').value) || 1, p_is_active: $('f-active').value === 'true'
      });
    } else if (tab === 'lectures') {
      await rpc('admin_save_lecture', {
        p_password: state.password, p_id: id,
        p_title: $('f-title').value.trim(), p_subject: $('f-sub').value.trim(),
        p_chapter: $('f-chap').value.trim(), p_batch: $('f-batch').value.trim(),
        p_teacher: $('f-teacher').value.trim(), p_video_url: $('f-url').value.trim(),
        p_duration: $('f-dur').value.trim(), p_is_published: $('f-pub').value === 'true'
      });
    } else if (tab === 'ncert') {
      await rpc('admin_save_ncert', {
        p_password: state.password, p_id: id,
        p_class_level: $('f-cls').value.trim(), p_subject: $('f-sub').value.trim(),
        p_chapter: $('f-chap').value.trim(), p_pdf_url: $('f-url').value.trim(),
        p_is_published: $('f-pub').value === 'true'
      });
    } else if (tab === 'notes') {
      await rpc('admin_save_note', {
        p_password: state.password, p_id: id,
        p_title: $('f-title').value.trim(), p_subject: $('f-sub').value.trim(),
        p_chapter: $('f-chap').value.trim(), p_exam_tag: $('f-tag').value.trim(),
        p_pdf_url: $('f-url').value.trim(), p_summary_md: $('f-sum').value.trim(),
        p_is_published: $('f-pub').value === 'true'
      });
    } else if (tab === 'quizzes') {
      const qs = JSON.parse($('f-qs').value);
      if (!Array.isArray(qs)) throw new Error('Questions must be a JSON array');
      await rpc('admin_save_quiz', {
        p_password: state.password, p_id: id,
        p_title: $('f-title').value.trim(), p_subject: $('f-sub').value.trim(),
        p_exam_tag: $('f-tag').value.trim(), p_duration_min: Number($('f-dur').value) || 15,
        p_questions: qs, p_is_published: $('f-pub').value === 'true'
      });
    }
    $('editor-modal').hidden = true;
    toast('Saved & synced live!');
    await syncDashboard();
  } catch (err) {
    toast(`Save failed: ${err.message}`, true);
  } finally {
    btn.disabled = false;
  }
}

async function togglePublish(id) {
  const tab = state.activeTab;
  try {
    if (tab === 'notices') {
      const n = state.data.notices.find((x) => x.id === id);
      await rpc('admin_save_notice', {
        p_password: state.password, p_id: n.id, p_badge: n.badge, p_title: n.title,
        p_message: n.message, p_cta_label: n.cta_label, p_cta_url: n.cta_url,
        p_tone: n.tone, p_priority: n.priority, p_is_active: !n.is_active
      });
    } else if (tab === 'lectures') {
      const l = state.data.lectures.find((x) => x.id === id);
      await rpc('admin_save_lecture', {
        p_password: state.password, p_id: l.id, p_title: l.title, p_subject: l.subject,
        p_chapter: l.chapter, p_batch: l.batch, p_teacher: l.teacher, p_video_url: l.video_url,
        p_duration: l.duration, p_is_published: !l.is_published
      });
    } else if (tab === 'ncert') {
      const p = state.data.ncert_pdfs.find((x) => x.id === id);
      await rpc('admin_save_ncert', {
        p_password: state.password, p_id: p.id, p_class_level: p.class_level,
        p_subject: p.subject, p_chapter: p.chapter, p_pdf_url: p.pdf_url, p_is_published: !p.is_published
      });
    } else if (tab === 'notes') {
      const n = state.data.topper_notes.find((x) => x.id === id);
      await rpc('admin_save_note', {
        p_password: state.password, p_id: n.id, p_title: n.title, p_subject: n.subject,
        p_chapter: n.chapter, p_exam_tag: n.exam_tag, p_pdf_url: n.pdf_url,
        p_summary_md: n.summary_md, p_is_published: !n.is_published
      });
    } else if (tab === 'quizzes') {
      const qz = state.data.quizzes.find((x) => x.id === id);
      await rpc('admin_save_quiz', {
        p_password: state.password, p_id: qz.id, p_title: qz.title, p_subject: qz.subject,
        p_exam_tag: qz.exam_tag, p_duration_min: qz.duration_min, p_questions: qz.questions, p_is_published: !qz.is_published
      });
    }
    toast('Status updated live');
    await syncDashboard();
  } catch (err) {
    toast(err.message, true);
  }
}

function exportUsersCsv() {
  if (!state.data.users.length) return toast('No users to export', true);
  const cols = ['id', 'full_name', 'email', 'language', 'created_at'];
  const lines = [cols.join(','), ...state.data.users.map((u) => cols.map((c) => `"${String(u[c] ?? '').replace(/"/g, '""')}"`).join(','))];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' }));
  a.download = `flipnote-users-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  toast(`Exported ${state.data.users.length} users`);
}

function startAutoRefresh() {
  stopAutoRefresh();
  if (state.refreshSec > 0) state.timerId = setInterval(syncDashboard, state.refreshSec * 1000);
}
function stopAutoRefresh() {
  if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
}

function enterApp() {
  $('login-screen').hidden = true;
  $('dashboard-screen').hidden = false;
  syncDashboard();
  startAutoRefresh();
}

document.addEventListener('DOMContentLoaded', () => {
  $('login-sb-url').value = state.supabaseUrl;
  $('login-sb-anon').value = state.anonKey;

  if (loadSession()) enterApp();

  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    state.supabaseUrl = $('login-sb-url').value.trim() || DEFAULT_SUPABASE_URL;
    state.anonKey = $('login-sb-anon').value.trim() || DEFAULT_SUPABASE_ANON_KEY;
    const pw = $('login-password').value;
    const errEl = $('login-error');
    errEl.hidden = true;
    $('btn-login-submit').disabled = true;
    $('btn-login-submit').textContent = 'Verifying…';

    try {
      const ok = await rpc('admin_login', { p_password: pw });
      if (!ok) throw new Error('Incorrect Admin Password');
      state.password = pw;
      saveSession();
      enterApp();
    } catch (err) {
      errEl.textContent = err.message.includes('admin_login')
        ? 'Run supabase/v81_cms_setup.sql in Supabase SQL Editor first!'
        : err.message;
      errEl.hidden = false;
    } finally {
      $('btn-login-submit').disabled = false;
      $('btn-login-submit').textContent = 'Unlock Live Admin';
    }
  });

  $('btn-logout').addEventListener('click', () => {
    clearSession();
    $('dashboard-screen').hidden = true;
    $('login-screen').hidden = false;
  });

  $('btn-refresh-now').addEventListener('click', () => { syncDashboard(); toast('Synced live'); });
  $('refresh-rate').addEventListener('change', (e) => {
    state.refreshSec = Number(e.target.value) || 0;
    startAutoRefresh();
  });

  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.activeTab = btn.dataset.tab;
      document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b === btn));
      renderTable();
    });
  });

  $('admin-search').addEventListener('input', (e) => { state.search = e.target.value; renderTable(); });
  $('btn-add-item').addEventListener('click', () => openEditorModal(null));
  $('btn-export-csv').addEventListener('click', exportUsersCsv);
  $('editor-cancel-btn').addEventListener('click', () => { $('editor-modal').hidden = true; });
  $('editor-form').addEventListener('submit', handleEditorSubmit);

  $('table-body').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const id = btn.dataset.id;

    if (act === 'edit') {
      const pool = state.activeTab === 'notices' ? state.data.notices
        : state.activeTab === 'lectures' ? state.data.lectures
        : state.activeTab === 'ncert' ? state.data.ncert_pdfs
        : state.activeTab === 'notes' ? state.data.topper_notes
        : state.data.quizzes;
      openEditorModal(pool.find((x) => x.id === id));
    } else if (act === 'toggle') {
      togglePublish(id);
    } else if (act === 'del') {
      if (!confirm('Delete this item permanently?')) return;
      try {
        await rpc('admin_delete_record', { p_password: state.password, p_table: btn.dataset.table, p_id: id });
        toast('Deleted');
        syncDashboard();
      } catch (err) {
        toast(err.message, true);
      }
    }
  });

  // Change Password modal
  $('btn-open-pw-modal').addEventListener('click', () => { $('pw-modal').hidden = false; });
  $('pw-cancel-btn').addEventListener('click', () => { $('pw-modal').hidden = true; });
  $('pw-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await rpc('admin_change_password', {
        p_old_password: $('pw-old').value,
        p_new_password: $('pw-new').value
      });
      state.password = $('pw-new').value;
      saveSession();
      $('pw-modal').hidden = true;
      $('pw-form').reset();
      toast('Admin password updated!');
    } catch (err) {
      toast(err.message, true);
    }
  });
});
