// FLIPNOTE v8.0 — Brain & AI Universe UI Controller (All 13 Features)

import { escapeHtml, showToast } from './utils.js';
import { listNotes, saveNoteRecord } from './notes.js';
import { listStudySets } from './flashcards.js';
import { getMistakes, STARTER_PACKS } from './v6.js';
import {
  generateSmartSummary,
  answerTutorQuestion,
  loadStreakData,
  recordDailyStudyActivity,
  useStreakFreeze,
  computeStreakMetrics,
  buildGlobalLeaderboard,
  loadCommunityNotes,
  upvoteCommunityNote,
  publishCommunityNote,
  searchFlipnoteBrain,
  convertLectureToNotes,
  solveWithSteps,
  generateSmartStudyPlan,
  loadStudyPlan,
  saveStudyPlan,
  buildVisualFlowchartSvg,
  loadVaultStore,
  setVaultPin,
  verifyVaultPin,
  addVaultItem,
  deleteVaultItem,
  loadMemoryPalace,
  updatePalaceStation,
  buildKnowledgeUniverseGraph
} from './v8.js';

let v8Callbacks = {
  onDataImported: null,
  getUserName: () => 'Student'
};

const v8State = {
  activeTab: 'summary',
  summaryMode: 'bullets',
  summaryNoteId: '__sample__',
  tutorMessages: [
    { role: 'ai', text: 'Hi! I am your FLIPNOTE Study Tutor. Ask me anything from your notes, formulas, or exam topics!' }
  ],
  brainQuery: '',
  lectureText: '',
  lectureTitle: 'Physics Lecture Notes',
  solverInput: 'x^2 - 5x + 6 = 0',
  solverResult: null,
  visualNoteId: '__sample__',
  vaultUnlocked: false,
  palaceWalkMode: false,
  palaceRevealed: new Set(),
  universeSelectedIdx: 0
};

export function initV8BrainHub(opts = {}) {
  v8Callbacks = { ...v8Callbacks, ...opts };
  document.querySelectorAll('#v8-subnav .v6-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      v8State.activeTab = btn.dataset.v8Tab;
      updateV8Tabs();
      renderActiveV8Panel();
    });
  });
}

export function refreshV8BrainHub(tabName = null) {
  if (tabName) v8State.activeTab = tabName;
  updateV8Tabs();
  renderActiveV8Panel();
}

function updateV8Tabs() {
  document.querySelectorAll('#v8-subnav .v6-tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.v8Tab === v8State.activeTab);
  });
  document.querySelectorAll('#view-brain .v8-panel').forEach((p) => {
    p.hidden = p.id !== `v8-panel-${v8State.activeTab}`;
  });
}

async function renderActiveV8Panel() {
  switch (v8State.activeTab) {
    case 'summary': return renderSummaryPanel();
    case 'tutor': return renderTutorPanel();
    case 'streak': return renderStreakPanel();
    case 'leaderboard': return renderLeaderboardPanel();
    case 'community': return renderCommunityPanel();
    case 'brain': return renderBrainSearchPanel();
    case 'lectures': return renderLecturesPanel();
    case 'solver': return renderSolverPanel();
    case 'planner': return renderPlannerPanel();
    case 'visual': return renderVisualPanel();
    case 'vault': return renderVaultPanel();
    case 'palace': return renderPalacePanel();
    case 'universe': return renderUniversePanel();
  }
}

// ============================================================================
// 1. AI SMART SUMMARY
// ============================================================================
async function renderSummaryPanel() {
  const el = document.getElementById('v8-panel-summary');
  if (!el) return;
  const notes = await listNotes();
  let sourceTitle = STARTER_PACKS[1].title;
  let sourceText = STARTER_PACKS[1].noteContent;
  const matched = notes.find((n) => n.id === v8State.summaryNoteId);
  if (matched) {
    sourceTitle = matched.title;
    sourceText = matched.content;
  } else if (notes.length && v8State.summaryNoteId === '__sample__') {
    v8State.summaryNoteId = notes[0].id;
    sourceTitle = notes[0].title;
    sourceText = notes[0].content;
  }

  const res = generateSmartSummary(sourceText, v8State.summaryMode);

  el.innerHTML = `
    <div class="glass-card v6-card">
      <div class="v6-toolbar">
        <div>
          <span class="v6-mini-tag">AI SMART SUMMARY</span>
          <h3 class="section-heading" style="margin:6px 0 0;">${escapeHtml(res.headline)}</h3>
          <p class="item-sub" style="margin:4px 0 0;">Distill any note into crisp exam bullets, 30-sec TL;DR, or key definitions offline.</p>
        </div>
        <span class="pill">${res.wordCount} words → ${res.points.length} key points</span>
      </div>

      <div class="v6-form-grid" style="margin-bottom:12px;">
        <div class="field-group">
          <label class="field-label" for="v8-sum-note">Choose Note</label>
          <select id="v8-sum-note" class="select">
            ${notes.map((n) => `<option value="${escapeHtml(n.id)}" ${n.id === v8State.summaryNoteId ? 'selected' : ''}>${escapeHtml(n.title)}</option>`).join('')}
            <option value="__sample__" ${v8State.summaryNoteId === '__sample__' ? 'selected' : ''}>Sample: Class 12 Physics</option>
          </select>
        </div>
        <div class="field-group">
          <label class="field-label" for="v8-sum-mode">Summary Style</label>
          <select id="v8-sum-mode" class="select">
            <option value="bullets" ${v8State.summaryMode === 'bullets' ? 'selected' : ''}>Key Bullet Points</option>
            <option value="tldr" ${v8State.summaryMode === 'tldr' ? 'selected' : ''}>30-Second TL;DR</option>
            <option value="cheat" ${v8State.summaryMode === 'cheat' ? 'selected' : ''}>Exam Cheat Sheet</option>
            <option value="definitions" ${v8State.summaryMode === 'definitions' ? 'selected' : ''}>Definitions &amp; Laws</option>
          </select>
        </div>
      </div>

      <div class="v6-board-result" style="margin-top:8px;">
        <strong style="display:block; margin-bottom:8px;">${escapeHtml(sourceTitle)}</strong>
        <ul class="v6-tips-list" style="margin:0;">
          ${res.points.map((pt) => `<li>${escapeHtml(pt)}</li>`).join('')}
        </ul>
        <div class="v6-kw-chips" style="margin-top:12px;">
          ${res.keyTerms.map((k) => `<span class="v6-mini-tag">#${escapeHtml(k)}</span>`).join('')}
        </div>
      </div>
    </div>
  `;

  el.querySelector('#v8-sum-note')?.addEventListener('change', (e) => {
    v8State.summaryNoteId = e.target.value;
    renderSummaryPanel();
  });
  el.querySelector('#v8-sum-mode')?.addEventListener('change', (e) => {
    v8State.summaryMode = e.target.value;
    renderSummaryPanel();
  });
}

// ============================================================================
// 2. AI STUDY TUTOR
// ============================================================================
async function renderTutorPanel() {
  const el = document.getElementById('v8-panel-tutor');
  if (!el) return;
  const notes = await listNotes();

  el.innerHTML = `
    <div class="glass-card v6-card">
      <span class="v6-mini-tag">NOTE-GROUNDED AI TUTOR</span>
      <h3 class="section-heading" style="margin:6px 0 4px;">AI Study Tutor</h3>
      <p class="item-sub" style="margin:0 0 12px;">Ask any question — your tutor pulls exact answers &amp; memory tips from your saved notes.</p>

      <div class="v8-chat-box" id="v8-tutor-feed">
        ${v8State.tutorMessages
          .map(
            (m) => `
          <div class="v8-chat-msg ${m.role === 'user' ? 'is-user' : 'is-ai'}">
            <div style="white-space:pre-wrap;">${escapeHtml(m.text)}</div>
            ${m.followUp ? `<p class="item-sub" style="margin:6px 0 0; font-size:0.78rem;">👉 ${escapeHtml(m.followUp)}</p>` : ''}
          </div>`
          )
          .join('')}
      </div>

      <div style="display:flex; gap:8px; margin-top:12px;">
        <input id="v8-tutor-input" class="input" type="text" placeholder="Ask e.g. Explain Ohm's Law or Gauss's Law..." />
        <button id="v8-tutor-send" class="btn btn-primary btn-sm" type="button">Ask Tutor</button>
      </div>
    </div>
  `;

  const send = () => {
    const inp = el.querySelector('#v8-tutor-input');
    const q = inp?.value.trim();
    if (!q) return;
    v8State.tutorMessages.push({ role: 'user', text: q });
    const ans = answerTutorQuestion(q, notes);
    v8State.tutorMessages.push({ role: 'ai', text: ans.reply, followUp: ans.followUp });
    recordDailyStudyActivity(10);
    renderTutorPanel();
    const feed = document.getElementById('v8-tutor-feed');
    if (feed) feed.scrollTop = feed.scrollHeight;
  };

  el.querySelector('#v8-tutor-send')?.addEventListener('click', send);
  el.querySelector('#v8-tutor-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') send();
  });
}

// ============================================================================
// 3. STUDY STREAK (30-DAY HEATMAP + FREEZE)
// ============================================================================
function renderStreakPanel() {
  const el = document.getElementById('v8-panel-streak');
  if (!el) return;
  const data = loadStreakData();
  const m = computeStreakMetrics(data);

  el.innerHTML = `
    <div class="glass-card v6-card">
      <div class="v6-toolbar">
        <div>
          <span class="v6-mini-tag">DAILY CONSISTENCY ENGINE</span>
          <h3 class="section-heading" style="margin:6px 0 0;">Study Streak &amp; 30-Day Heatmap</h3>
        </div>
        <div class="btn-row" style="margin:0;">
          <button id="v8-streak-checkin" class="btn btn-primary btn-sm" type="button">🔥 Daily Check-In (+25 XP)</button>
          <button id="v8-streak-freeze" class="btn btn-secondary btn-sm" type="button" ${m.freezesLeft > 0 ? '' : 'disabled'}>❄️ Use Freeze (${m.freezesLeft})</button>
        </div>
      </div>

      <div class="v6-stats-strip">
        <div class="v6-stat-chip"><strong style="color:var(--warning);">🔥 ${m.currentStreak}d</strong><span>Current Streak</span></div>
        <div class="v6-stat-chip"><strong>🏆 ${m.longestStreak}d</strong><span>Longest Streak</span></div>
        <div class="v6-stat-chip"><strong style="color:var(--success);">${m.xp} XP</strong><span>Total Study XP</span></div>
        <div class="v6-stat-chip"><strong>❄️ ${m.freezesLeft}</strong><span>Streak Freezes</span></div>
      </div>

      <p class="field-label" style="margin:14px 0 8px;">Last 30 Days Study Activity</p>
      <div class="v8-heatmap">
        ${m.heatmap
          .map((d) => {
            const lvl = d.count === 0 ? 0 : d.count === 1 ? 1 : d.count <= 3 ? 2 : 3;
            return `<div class="v8-heat-cell lvl-${lvl}" title="${escapeHtml(d.date)}: ${d.count} sessions"></div>`;
          })
          .join('')}
      </div>
    </div>
  `;

  el.querySelector('#v8-streak-checkin')?.addEventListener('click', () => {
    recordDailyStudyActivity(25);
    showToast('🔥 +25 XP! Daily study streak updated.');
    renderStreakPanel();
  });

  el.querySelector('#v8-streak-freeze')?.addEventListener('click', () => {
    const res = useStreakFreeze();
    showToast(res.ok ? '❄️ Streak Freeze applied to protect yesterday!' : 'No freezes left.');
    renderStreakPanel();
  });
}

// ============================================================================
// 4. GLOBAL LEADERBOARD
// ============================================================================
function renderLeaderboardPanel() {
  const el = document.getElementById('v8-panel-leaderboard');
  if (!el) return;
  const s = computeStreakMetrics(loadStreakData());
  const userName = v8Callbacks.getUserName ? v8Callbacks.getUserName() : 'You';
  const { ranked, userRow } = buildGlobalLeaderboard(userName, s.xp, s.currentStreak);

  el.innerHTML = `
    <div class="glass-card v6-card">
      <div class="v6-toolbar">
        <div>
          <span class="v6-mini-tag">COMPETITIVE LEAGUES</span>
          <h3 class="section-heading" style="margin:6px 0 0;">Global Student Leaderboard</h3>
          <p class="item-sub" style="margin:4px 0 0;">Your Rank: <strong>#${userRow.rank}</strong> • ${userRow.league.badge} ${escapeHtml(userRow.league.name)} (${userRow.xp} XP)</p>
        </div>
      </div>

      <div class="v72-chapter-grid">
        ${ranked
          .map(
            (r) => `
          <div class="v72-pdf-row ${r.isUser ? 'v8-lb-me' : ''}">
            <div style="display:flex; align-items:center; gap:10px;">
              <strong style="min-width:34px; color:var(--accent);">#${r.rank}</strong>
              <div>
                <strong>${escapeHtml(r.name)} ${r.isUser ? '(You)' : ''}</strong>
                <span class="item-sub" style="margin-left:6px;">${escapeHtml(r.exam)} • 🔥 ${r.streak}d</span>
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="v6-mini-tag">${r.league.badge} ${escapeHtml(r.league.name)}</span>
              <strong>${r.xp} XP</strong>
            </div>
          </div>`
          )
          .join('')}
      </div>
    </div>
  `;
}

// ============================================================================
// 5. COMMUNITY NOTES LIBRARY
// ============================================================================
function renderCommunityPanel() {
  const el = document.getElementById('v8-panel-community');
  if (!el) return;
  const list = loadCommunityNotes();

  el.innerHTML = `
    <div class="glass-card v6-card">
      <div class="v6-toolbar">
        <div>
          <span class="v6-mini-tag">TOPPER SHARED NOTES</span>
          <h3 class="section-heading" style="margin:6px 0 0;">Community Notes Library</h3>
          <p class="item-sub" style="margin:4px 0 0;">Clone topper notes straight into your library or publish your own notes.</p>
        </div>
        <button id="v8-comm-pub-toggle" class="btn btn-primary btn-sm" type="button">+ Publish Note</button>
      </div>

      <div id="v8-comm-pub-box" class="v6-board-result" hidden style="margin-bottom:14px;">
        <div class="v6-form-grid">
          <input id="v8-comm-title" class="input" type="text" placeholder="Note title..." />
          <input id="v8-comm-subj" class="input" type="text" placeholder="Subject (e.g. Physics)" />
        </div>
        <textarea id="v8-comm-body" class="textarea" rows="3" placeholder="Paste your topper note or formula sheet..." style="margin-top:8px;"></textarea>
        <button id="v8-comm-pub-save" class="btn btn-primary btn-sm" type="button" style="margin-top:8px;">Publish to Community</button>
      </div>

      <div class="v6-packs-grid">
        ${list
          .map(
            (n) => `
          <article class="v6-pack-card">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span class="v6-mini-tag">${escapeHtml(n.subject)}</span>
              <span class="item-sub">▲ ${n.upvotes}</span>
            </div>
            <h4 style="margin:8px 0 4px; font-size:0.98rem;">${escapeHtml(n.title)}</h4>
            <p class="item-sub" style="margin:0 0 10px;">By ${escapeHtml(n.author)}</p>
            <div class="btn-row" style="margin-top:auto;">
              <button class="btn btn-primary btn-sm" data-comm-clone="${escapeHtml(n.id)}" type="button">📥 Clone to Notes</button>
              <button class="btn btn-secondary btn-sm" data-comm-up="${escapeHtml(n.id)}" type="button">▲ Upvote</button>
            </div>
          </article>`
          )
          .join('')}
      </div>
    </div>
  `;

  el.querySelector('#v8-comm-pub-toggle')?.addEventListener('click', () => {
    const box = el.querySelector('#v8-comm-pub-box');
    if (box) box.hidden = !box.hidden;
  });

  el.querySelector('#v8-comm-pub-save')?.addEventListener('click', () => {
    const title = el.querySelector('#v8-comm-title')?.value.trim();
    const subject = el.querySelector('#v8-comm-subj')?.value.trim() || 'General';
    const content = el.querySelector('#v8-comm-body')?.value.trim();
    if (!title || !content) {
      showToast('Enter title and content first.');
      return;
    }
    publishCommunityNote({ title, author: v8Callbacks.getUserName?.() || 'Student', subject, content });
    recordDailyStudyActivity(30);
    showToast('Published to Community Notes (+30 XP)!');
    renderCommunityPanel();
  });

  el.querySelectorAll('[data-comm-up]').forEach((b) => {
    b.addEventListener('click', () => {
      upvoteCommunityNote(b.dataset.commUp);
      renderCommunityPanel();
    });
  });

  el.querySelectorAll('[data-comm-clone]').forEach((b) => {
    b.addEventListener('click', async () => {
      const item = list.find((x) => x.id === b.dataset.commClone);
      if (!item) return;
      await saveNoteRecord({ title: item.title, subject: item.subject, content: item.content, language: 'en' });
      if (typeof v8Callbacks.onDataImported === 'function') await v8Callbacks.onDataImported();
      showToast(`Cloned "${item.title}" to your Smart Notes!`);
    });
  });
}

// ============================================================================
// 6. FLIPNOTE BRAIN (UNIFIED SECOND-BRAIN SEARCH)
// ============================================================================
async function renderBrainSearchPanel() {
  const el = document.getElementById('v8-panel-brain');
  if (!el) return;
  const [notes, sets] = await Promise.all([listNotes(), listStudySets()]);
  const mistakes = getMistakes();
  const res = searchFlipnoteBrain(v8State.brainQuery, { notes, sets, mistakes });

  el.innerHTML = `
    <div class="glass-card v6-card">
      <span class="v6-mini-tag">UNIFIED SECOND BRAIN</span>
      <h3 class="section-heading" style="margin:6px 0 4px;">FLIPNOTE Brain Search</h3>
      <p class="item-sub" style="margin:0 0 12px;">Search across ALL your Notes, Formulas, Flashcards &amp; Mistakes simultaneously.</p>
      <input id="v8-brain-q" class="input" type="text" placeholder="Search any concept (e.g. Ohm, Gauss, Aldol, Integral)..." value="${escapeHtml(v8State.brainQuery)}" />

      ${
        v8State.brainQuery.trim()
          ? `<div style="margin-top:14px;">
              <p class="item-sub">Found <strong>${res.total}</strong> linked memories across your second brain:</p>
              <div class="v6-stats-strip">
                <div class="v6-stat-chip"><strong>${res.notes.length}</strong><span>Notes</span></div>
                <div class="v6-stat-chip"><strong>${res.formulas.length}</strong><span>Formulas</span></div>
                <div class="v6-stat-chip"><strong>${res.flashcards.length}</strong><span>Flashcards</span></div>
                <div class="v6-stat-chip"><strong>${res.mistakes.length}</strong><span>Mistakes</span></div>
              </div>
              <div class="v72-chapter-grid">
                ${res.formulas.slice(0, 6).map((f) => `<div class="v72-pdf-row"><span class="v6-mini-tag">Formula</span><code>${escapeHtml(f.expression)}</code></div>`).join('')}
                ${res.notes.slice(0, 5).map((n) => `<div class="v72-pdf-row"><span class="v6-mini-tag">Note</span><strong>${escapeHtml(n.title)}</strong></div>`).join('')}
                ${res.flashcards.slice(0, 5).map((c) => `<div class="v72-pdf-row"><span class="v6-mini-tag">Card</span><span>${escapeHtml(c.front)}</span></div>`).join('')}
              </div>
            </div>`
          : '<p class="item-sub" style="margin-top:12px;">Start typing to connect ideas across your entire FLIPNOTE library.</p>'
      }
    </div>
  `;

  el.querySelector('#v8-brain-q')?.addEventListener('input', (e) => {
    v8State.brainQuery = e.target.value;
    renderBrainSearchPanel();
    const inp = document.getElementById('v8-brain-q');
    if (inp) {
      inp.focus();
      inp.setSelectionRange(inp.value.length, inp.value.length);
    }
  });
}

// ============================================================================
// 7. LECTURES TO NOTES
// ============================================================================
function renderLecturesPanel() {
  const el = document.getElementById('v8-panel-lectures');
  if (!el) return;
  const preview = v8State.lectureText ? convertLectureToNotes(v8State.lectureText, v8State.lectureTitle) : null;

  el.innerHTML = `
    <div class="glass-card v6-card">
      <div class="v6-toolbar">
        <div>
          <span class="v6-mini-tag">LIVE VOICE OR TRANSCRIPT</span>
          <h3 class="section-heading" style="margin:6px 0 0;">Lectures to Structured Notes</h3>
          <p class="item-sub" style="margin:4px 0 0;">Record a live class lecture via mic or paste any YouTube transcript — auto-cleans filler words into neat exam notes.</p>
        </div>
        <button id="v8-lec-mic" class="btn btn-secondary btn-sm" type="button">🎙️ Record Live Lecture</button>
      </div>

      <div class="field-group" style="margin-bottom:10px;">
        <input id="v8-lec-title" class="input" type="text" value="${escapeHtml(v8State.lectureTitle)}" placeholder="Lecture Title..." />
      </div>
      <textarea id="v8-lec-raw" class="textarea" rows="5" placeholder="Paste lecture transcript or click Record Live Lecture...">${escapeHtml(v8State.lectureText)}</textarea>
      <div class="btn-row" style="margin-top:10px;">
        <button id="v8-lec-convert" class="btn btn-primary btn-sm" type="button">✨ Structure Lecture</button>
        ${preview && preview.takeaways.length ? `<button id="v8-lec-save" class="btn btn-secondary btn-sm" type="button">💾 Save to Smart Notes</button>` : ''}
      </div>

      ${
        preview && preview.takeaways.length
          ? `<div class="v6-board-result" style="margin-top:14px;">
              <strong>Structured Preview (${preview.takeaways.length} key points):</strong>
              <ul class="v6-tips-list">${preview.takeaways.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>
            </div>`
          : ''
      }
    </div>
  `;

  el.querySelector('#v8-lec-mic')?.addEventListener('click', () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      showToast('Live mic speech recognition is not supported in this browser.');
      return;
    }
    const rec = new SR();
    rec.lang = 'en-IN';
    rec.onresult = (ev) => {
      const txt = ev.results?.[0]?.[0]?.transcript || '';
      v8State.lectureText = `${v8State.lectureText} ${txt}`.trim();
      renderLecturesPanel();
    };
    rec.start();
    showToast('🎙️ Listening to lecture...');
  });

  el.querySelector('#v8-lec-convert')?.addEventListener('click', () => {
    v8State.lectureTitle = el.querySelector('#v8-lec-title')?.value.trim() || 'Lecture Notes';
    v8State.lectureText = el.querySelector('#v8-lec-raw')?.value || '';
    renderLecturesPanel();
  });

  el.querySelector('#v8-lec-save')?.addEventListener('click', async () => {
    if (!preview) return;
    await saveNoteRecord({ title: preview.title, subject: 'Lecture', content: preview.formattedContent, language: 'en' });
    if (typeof v8Callbacks.onDataImported === 'function') await v8Callbacks.onDataImported();
    recordDailyStudyActivity(20);
    showToast('Saved structured lecture to Smart Notes (+20 XP)!');
  });
}

// ============================================================================
// 8. SOLVE WITH STEPS
// ============================================================================
function renderSolverPanel() {
  const el = document.getElementById('v8-panel-solver');
  if (!el) return;
  const res = v8State.solverResult || solveWithSteps(v8State.solverInput);

  el.innerHTML = `
    <div class="glass-card v6-card">
      <span class="v6-mini-tag">OFFLINE STEP-BY-STEP SOLVER</span>
      <h3 class="section-heading" style="margin:6px 0 4px;">Solve with Steps</h3>
      <p class="item-sub" style="margin:0 0 12px;">Solve Quadratics, Linear Equations, BODMAS Arithmetic, or Physics Formulas (Ohm's Law, Kinematics, KE, Force) with full steps.</p>

      <div style="display:flex; gap:8px; margin-bottom:10px;">
        <input id="v8-solver-in" class="input" type="text" value="${escapeHtml(v8State.solverInput)}" placeholder="e.g. x^2 - 5x + 6 = 0  or  u=0, a=3, t=5" />
        <button id="v8-solver-go" class="btn btn-primary btn-sm" type="button">Solve</button>
      </div>

      <div class="v6-pill-row">
        ${['x^2 - 5x + 6 = 0', '3x + 7 = 22', 'I=4, R=12', 'u=0, a=3, t=6', 'm=5, v=8']
          .map((ex) => `<button class="v6-filter-pill" data-solve-ex="${escapeHtml(ex)}" type="button">${escapeHtml(ex)}</button>`)
          .join('')}
      </div>

      <div class="v6-board-result" style="margin-top:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <strong>${escapeHtml(res.title)}</strong>
          <span class="pill" style="color:var(--success);">Answer: ${escapeHtml(res.answer)}</span>
        </div>
        <ol class="v6-tips-list" style="margin-top:10px;">
          ${res.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}
        </ol>
      </div>
    </div>
  `;

  el.querySelector('#v8-solver-go')?.addEventListener('click', () => {
    v8State.solverInput = el.querySelector('#v8-solver-in')?.value || '';
    v8State.solverResult = solveWithSteps(v8State.solverInput);
    renderSolverPanel();
  });

  el.querySelectorAll('[data-solve-ex]').forEach((b) => {
    b.addEventListener('click', () => {
      v8State.solverInput = b.dataset.solveEx;
      v8State.solverResult = solveWithSteps(v8State.solverInput);
      renderSolverPanel();
    });
  });
}

// ============================================================================
// 9. STUDY PLANNER
// ============================================================================
function renderPlannerPanel() {
  const el = document.getElementById('v8-panel-planner');
  if (!el) return;
  const plan = loadStudyPlan();

  el.innerHTML = `
    <div class="glass-card v6-card">
      <div class="v6-toolbar">
        <div>
          <span class="v6-mini-tag">SMART DAILY TIMETABLE</span>
          <h3 class="section-heading" style="margin:6px 0 0;">Study Planner (${plan.hoursPerDay}h/day • ${escapeHtml(plan.targetExam)})</h3>
        </div>
      </div>

      <div class="v6-form-grid" style="margin-bottom:14px;">
        <div class="field-group">
          <label class="field-label" for="v8-plan-hrs">Daily Study Hours</label>
          <select id="v8-plan-hrs" class="select">
            ${[2, 3, 4, 6, 8].map((h) => `<option value="${h}" ${plan.hoursPerDay === h ? 'selected' : ''}>${h} Hours / Day</option>`).join('')}
          </select>
        </div>
        <div class="field-group">
          <label class="field-label" for="v8-plan-subj">Priority Subject</label>
          <select id="v8-plan-subj" class="select">
            ${['Physics', 'Chemistry', 'Mathematics', 'Science', 'Biology'].map((s) => `<option value="${s}" ${plan.focusSubject === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="field-group" style="display:flex; align-items:flex-end;">
          <button id="v8-plan-gen" class="btn btn-primary btn-sm" type="button" style="width:100%;">⚡ Generate Timetable</button>
        </div>
      </div>

      <div class="v72-chapter-grid">
        ${plan.blocks
          .map(
            (b) => `
          <label class="v72-pdf-row ${b.done ? 'is-complete' : ''}" style="cursor:pointer;">
            <div style="display:flex; align-items:center; gap:10px;">
              <input type="checkbox" data-plan-chk="${escapeHtml(b.id)}" ${b.done ? 'checked' : ''} />
              <div>
                <strong>${escapeHtml(b.slot)}</strong> — <span>${escapeHtml(b.task)}</span>
              </div>
            </div>
            <span class="v6-mini-tag">${escapeHtml(b.type)}</span>
          </label>`
          )
          .join('')}
      </div>
    </div>
  `;

  el.querySelector('#v8-plan-gen')?.addEventListener('click', () => {
    const hrs = Number(el.querySelector('#v8-plan-hrs')?.value || 4);
    const subj = el.querySelector('#v8-plan-subj')?.value || 'Physics';
    generateSmartStudyPlan({ hoursPerDay: hrs, focusSubject: subj, targetExam: plan.targetExam });
    showToast('Smart daily study timetable generated!');
    renderPlannerPanel();
  });

  el.querySelectorAll('[data-plan-chk]').forEach((chk) => {
    chk.addEventListener('change', () => {
      const p = loadStudyPlan();
      const blk = p.blocks.find((x) => x.id === chk.dataset.planChk);
      if (blk) {
        blk.done = chk.checked;
        saveStudyPlan(p);
        if (blk.done) recordDailyStudyActivity(15);
        renderPlannerPanel();
      }
    });
  });
}

// ============================================================================
// 10. VISUAL LEARNING MODE
// ============================================================================
async function renderVisualPanel() {
  const el = document.getElementById('v8-panel-visual');
  if (!el) return;
  const notes = await listNotes();
  const matched = notes.find((n) => n.id === v8State.visualNoteId) || notes[0] || {
    id: '__sample__',
    title: STARTER_PACKS[0].title,
    content: STARTER_PACKS[0].noteContent
  };
  v8State.visualNoteId = matched.id;

  const svg = buildVisualFlowchartSvg(matched.title, matched.content);

  el.innerHTML = `
    <div class="glass-card v6-card">
      <div class="v6-toolbar">
        <div>
          <span class="v6-mini-tag">VISUAL CONCEPT FLOWCHART</span>
          <h3 class="section-heading" style="margin:6px 0 0;">Visual Learning Mode</h3>
          <p class="item-sub" style="margin:4px 0 0;">Auto-converts any note into a color-coded visual flow diagram for faster photographic recall.</p>
        </div>
      </div>

      <div class="field-group" style="margin-bottom:12px;">
        <select id="v8-vis-note" class="select">
          ${notes.map((n) => `<option value="${escapeHtml(n.id)}" ${n.id === matched.id ? 'selected' : ''}>${escapeHtml(n.title)}</option>`).join('')}
          ${!notes.length ? `<option value="__sample__">Sample: Class 10 Science</option>` : ''}
        </select>
      </div>

      <div class="v8-visual-box">${svg}</div>
    </div>
  `;

  el.querySelector('#v8-vis-note')?.addEventListener('change', (e) => {
    v8State.visualNoteId = e.target.value;
    renderVisualPanel();
  });
}

// ============================================================================
// 11. PRIVACY VAULT (4-DIGIT PIN LOCK)
// ============================================================================
function renderVaultPanel() {
  const el = document.getElementById('v8-panel-vault');
  if (!el) return;
  const store = loadVaultStore();

  if (!store.pinHash) {
    el.innerHTML = `
      <div class="glass-card v6-card" style="text-align:center;">
        <span class="v6-mini-tag">🔒 LOCAL PIN-LOCKED VAULT</span>
        <h3 class="section-heading" style="margin:10px 0 6px;">Create Your Privacy Vault PIN</h3>
        <p class="item-sub" style="margin:0 0 14px;">Lock private study goals, journals, or personal notes behind a 4-digit PIN stored 100% locally.</p>
        <div style="max-width:260px; margin:0 auto; display:flex; gap:8px;">
          <input id="v8-vault-new-pin" class="input" type="password" maxlength="6" placeholder="4-digit PIN" />
          <button id="v8-vault-set-pin" class="btn btn-primary btn-sm" type="button">Set PIN</button>
        </div>
      </div>
    `;
    el.querySelector('#v8-vault-set-pin')?.addEventListener('click', () => {
      const pin = el.querySelector('#v8-vault-new-pin')?.value.trim();
      if (!pin || pin.length < 4) {
        showToast('Enter at least a 4-digit PIN.');
        return;
      }
      setVaultPin(pin);
      v8State.vaultUnlocked = true;
      showToast('🔒 Privacy Vault PIN set & unlocked!');
      renderVaultPanel();
    });
    return;
  }

  if (!v8State.vaultUnlocked) {
    el.innerHTML = `
      <div class="glass-card v6-card" style="text-align:center;">
        <span class="v6-mini-tag">🔒 VAULT LOCKED</span>
        <h3 class="section-heading" style="margin:10px 0 6px;">Unlock Privacy Vault</h3>
        <p class="item-sub" style="margin:0 0 14px;">${store.items.length} private note(s) locked on this device.</p>
        <div style="max-width:260px; margin:0 auto; display:flex; gap:8px;">
          <input id="v8-vault-pin" class="input" type="password" maxlength="6" placeholder="Enter PIN" />
          <button id="v8-vault-unlock" class="btn btn-primary btn-sm" type="button">Unlock</button>
        </div>
      </div>
    `;
    el.querySelector('#v8-vault-unlock')?.addEventListener('click', () => {
      const pin = el.querySelector('#v8-vault-pin')?.value.trim();
      if (verifyVaultPin(pin)) {
        v8State.vaultUnlocked = true;
        renderVaultPanel();
      } else {
        showToast('Incorrect PIN. Try again.');
      }
    });
    return;
  }

  el.innerHTML = `
    <div class="glass-card v6-card">
      <div class="v6-toolbar">
        <div>
          <span class="v6-mini-tag">🔓 VAULT UNLOCKED</span>
          <h3 class="section-heading" style="margin:6px 0 0;">Private Vault Notes</h3>
        </div>
        <button id="v8-vault-lock" class="btn btn-danger btn-sm" type="button">🔒 Lock Vault</button>
      </div>

      <div class="field-group" style="margin-bottom:8px;">
        <input id="v8-vault-title" class="input" type="text" placeholder="Private note title..." />
      </div>
      <textarea id="v8-vault-body" class="textarea" rows="3" placeholder="Write private goal, diary, or locked note..."></textarea>
      <button id="v8-vault-add" class="btn btn-primary btn-sm" type="button" style="margin:8px 0 14px;">+ Save to Vault</button>

      <div class="v72-chapter-grid">
        ${store.items
          .map(
            (item) => `
          <div class="v72-pdf-row">
            <div>
              <strong>${escapeHtml(item.title)}</strong>
              <p class="item-sub" style="margin:4px 0 0;">${escapeHtml(item.body)}</p>
            </div>
            <button class="btn btn-ghost btn-sm" data-vdel="${escapeHtml(item.id)}" type="button">✕</button>
          </div>`
          )
          .join('') || '<p class="item-sub">No private notes yet.</p>'}
      </div>
    </div>
  `;

  el.querySelector('#v8-vault-lock')?.addEventListener('click', () => {
    v8State.vaultUnlocked = false;
    renderVaultPanel();
  });
  el.querySelector('#v8-vault-add')?.addEventListener('click', () => {
    const title = el.querySelector('#v8-vault-title')?.value.trim();
    const body = el.querySelector('#v8-vault-body')?.value.trim();
    if (!title && !body) return;
    addVaultItem({ title: title || 'Private Note', body });
    renderVaultPanel();
  });
  el.querySelectorAll('[data-vdel]').forEach((b) => {
    b.addEventListener('click', () => {
      deleteVaultItem(b.dataset.vdel);
      renderVaultPanel();
    });
  });
}

// ============================================================================
// 12. MEMORY PALACE (LOCI METHOD SPATIAL ROOM)
// ============================================================================
function renderPalacePanel() {
  const el = document.getElementById('v8-panel-palace');
  if (!el) return;
  const stations = loadMemoryPalace();

  el.innerHTML = `
    <div class="glass-card v6-card">
      <div class="v6-toolbar">
        <div>
          <span class="v6-mini-tag">ANCIENT LOCI MEMORY METHOD</span>
          <h3 class="section-heading" style="margin:6px 0 0;">Memory Palace — Study Room</h3>
          <p class="item-sub" style="margin:4px 0 0;">Anchor hard formulas to physical room objects. Switch to Recall Walk to test yourself by location!</p>
        </div>
        <button id="v8-palace-mode" class="btn ${v8State.palaceWalkMode ? 'btn-primary' : 'btn-secondary'} btn-sm" type="button">
          ${v8State.palaceWalkMode ? '👁️ Recall Walk: ON' : '🚶 Start Recall Walk'}
        </button>
      </div>

      <div class="v6-packs-grid">
        ${stations
          .map((st) => {
            const open = !v8State.palaceWalkMode || v8State.palaceRevealed.has(st.id);
            return `
            <article class="v6-pack-card" data-palace-card="${escapeHtml(st.id)}" style="cursor:pointer;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:1.5rem;">${st.icon}</span>
                <span class="v6-mini-tag">${escapeHtml(st.locus)}</span>
              </div>
              <h4 style="margin:10px 0 6px; font-size:0.98rem;">${open ? escapeHtml(st.cue) : '🔒 Tap to recall anchor'}</h4>
              <p class="item-sub" style="margin:0 0 10px;">${open ? escapeHtml(st.detail) : 'Visualize what you placed here...'}</p>
              ${!v8State.palaceWalkMode ? `<button class="btn btn-ghost btn-sm" data-palace-edit="${escapeHtml(st.id)}" type="button" style="align-self:flex-start;">✏️ Edit Anchor</button>` : ''}
            </article>`;
          })
          .join('')}
      </div>
    </div>
  `;

  el.querySelector('#v8-palace-mode')?.addEventListener('click', () => {
    v8State.palaceWalkMode = !v8State.palaceWalkMode;
    v8State.palaceRevealed.clear();
    renderPalacePanel();
  });

  el.querySelectorAll('[data-palace-card]').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-palace-edit]')) return;
      if (!v8State.palaceWalkMode) return;
      const id = card.dataset.palaceCard;
      if (v8State.palaceRevealed.has(id)) v8State.palaceRevealed.delete(id);
      else v8State.palaceRevealed.add(id);
      renderPalacePanel();
    });
  });

  el.querySelectorAll('[data-palace-edit]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const st = stations.find((x) => x.id === btn.dataset.palaceEdit);
      if (!st) return;
      const cue = window.prompt(`Formula / Fact to place at ${st.locus}:`, st.cue);
      if (cue === null) return;
      const detail = window.prompt('Visual mental image cue:', st.detail) ?? st.detail;
      updatePalaceStation(st.id, { cue: cue.trim() || st.cue, detail: detail.trim() });
      renderPalacePanel();
    });
  });
}

// ============================================================================
// 13. KNOWLEDGE UNIVERSE (INTERACTIVE CONSTELLATION GALAXY)
// ============================================================================
async function renderUniversePanel() {
  const el = document.getElementById('v8-panel-universe');
  if (!el) return;
  const notes = await listNotes();
  const { nodes, edges } = buildKnowledgeUniverseGraph(notes);
  const selected = nodes[v8State.universeSelectedIdx] || nodes[0];

  const edgeSvg = edges
    .map((e) => {
      const a = nodes[e.from];
      const b = nodes[e.to];
      return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="rgba(148,163,184,0.28)" stroke-width="${Math.min(3, e.weight)}" />`;
    })
    .join('');

  const nodeSvg = nodes
    .map(
      (n, i) => `
      <g class="v8-star-node" data-star-idx="${i}" style="cursor:pointer;">
        <circle cx="${n.x}" cy="${n.y}" r="${i === v8State.universeSelectedIdx ? 22 : 14}" fill="${n.color}" opacity="0.22" />
        <circle cx="${n.x}" cy="${n.y}" r="${i === v8State.universeSelectedIdx ? 10 : 7}" fill="${n.color}" stroke="#ffffff" stroke-width="2" />
        <text x="${n.x}" y="${n.y + 24}" text-anchor="middle" fill="#e2e8f0" font-size="11" font-weight="600">${escapeHtml(n.title.slice(0, 18))}</text>
      </g>`
    )
    .join('');

  el.innerHTML = `
    <div class="glass-card v6-card">
      <div class="v6-toolbar">
        <div>
          <span class="v6-mini-tag">INTERACTIVE CONSTELLATION GRAPH</span>
          <h3 class="section-heading" style="margin:6px 0 0;">Knowledge Universe</h3>
          <p class="item-sub" style="margin:4px 0 0;">Every note is a glowing star connected by shared concepts (${nodes.length} stars • ${edges.length} links). Tap any star to inspect!</p>
        </div>
      </div>

      <svg viewBox="0 0 680 430" class="v8-universe-svg">
        <rect width="680" height="430" rx="18" fill="#060919" />
        ${edgeSvg}
        ${nodeSvg}
      </svg>

      ${
        selected
          ? `<div class="v6-board-result" style="margin-top:12px;">
              <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                <strong>⭐ ${escapeHtml(selected.title)}</strong>
                <span class="v6-mini-tag">${escapeHtml(selected.subject)}</span>
              </div>
              <div class="v6-kw-chips" style="margin-top:8px;">
                ${selected.terms.slice(0, 10).map((t) => `<span class="v6-mini-tag">#${escapeHtml(t)}</span>`).join('')}
              </div>
            </div>`
          : ''
      }
    </div>
  `;

  el.querySelectorAll('[data-star-idx]').forEach((g) => {
    g.addEventListener('click', () => {
      v8State.universeSelectedIdx = Number(g.dataset.starIdx);
      renderUniversePanel();
    });
  });
}
