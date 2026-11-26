// FLIPNOTE v6.0 — Exam Hub UI Controller (JEE & Class 10/12 Boards)
// Wires all 6 v6.0 features inside #view-examhub with Apple Glassmorphism UI.

import { uid, escapeHtml, showToast } from './utils.js';
import { listNotes, saveNoteRecord } from './notes.js';
import { saveStudySet } from './flashcards.js';
import { listQuizzes, recordQuizAttempt } from './quiz.js';
import {
  extractFormulasFromNotes,
  buildPrintableFormulaHtml,
  MISTAKE_TAGS,
  getMistakes,
  logMistakes,
  updateMistake,
  deleteMistake,
  getMistakeStats,
  buildRetestQuestions,
  MARKING_SCHEMES,
  buildCbtQuestionPool,
  scoreCbtAttempt,
  BOARD_SAMPLE_QUESTIONS,
  evaluateBoardAnswer,
  SYLLABUS_PRESETS,
  createInitialSyllabusState,
  loadSyllabusState,
  saveSyllabusState,
  computeCountdown,
  computeSyllabusProgress,
  STARTER_PACKS
} from './v6.js';
import { buildSpeedRadarReport, saveSpeedRadarReport } from './v7.js';
import { renderV7Panel } from './v7-ui.js';
import { predictJeePercentile } from './v71.js';
import { renderV71Panel, initCbtRoughSheet } from './v71-ui.js';
import { renderNcertPdfHubPanel } from './v72-ui.js';

let callbacks = {
  onOpenRetest: null,
  onDataImported: null,
  onLogSession: null
};

const uiState = {
  activeTab: 'formulas', // formulas | mistakes | cbt | board | syllabus | packs
  // Formula Sheet
  formulaSubject: 'All',
  formulaBlankMode: false,
  formulaRevealed: new Set(),
  formulaGotIt: new Set(),
  // Mistake Notebook
  mistakeFilterTag: 'All',
  mistakeShowMastered: false,
  // NTA JEE CBT
  cbtActive: false,
  cbtQuestions: [],
  cbtIndex: 0,
  cbtResponses: {}, // { [qId]: { selectedIndex, marked, visited } }
  cbtScheme: 'jee',
  cbtTimerSec: 0,
  cbtTimerHandle: null,
  cbtResult: null,
  cbtTimings: {},
  cbtQuestionEnteredAt: 0,
  // Board Checker
  boardSourceId: BOARD_SAMPLE_QUESTIONS[0].id,
  boardMarks: 3,
  boardLastResult: null,
  boardSpeechRec: null,
  // Syllabus
  syllabusSubject: 'All'
};

function formatClock(totalSec) {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function flushCurrentCbtQuestionTime() {
  const curQ = uiState.cbtQuestions[uiState.cbtIndex];
  if (curQ && uiState.cbtQuestionEnteredAt) {
    const delta = Math.max(1, Math.round((Date.now() - uiState.cbtQuestionEnteredAt) / 1000));
    uiState.cbtTimings[curQ.id] = (uiState.cbtTimings[curQ.id] || 0) + delta;
  }
  uiState.cbtQuestionEnteredAt = Date.now();
}

function stopCbtTimer() {
  if (uiState.cbtTimerHandle) {
    clearInterval(uiState.cbtTimerHandle);
    uiState.cbtTimerHandle = null;
  }
}

export function initV6ExamHub(opts = {}) {
  callbacks = { ...callbacks, ...opts };

  // Wire sub-navigation tabs
  document.querySelectorAll('#v6-subnav .v6-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      uiState.activeTab = btn.dataset.v6Tab;
      updateActiveTabUI();
      renderActiveV6Panel();
    });
  });

  // Update mistake badge on boot
  updateMistakeBadge();
}

export function refreshV6ExamHub(tabName = null) {
  if (tabName) uiState.activeTab = tabName;
  updateActiveTabUI();
  updateMistakeBadge();
  renderActiveV6Panel();
}

function updateActiveTabUI() {
  document.querySelectorAll('#v6-subnav .v6-tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.v6Tab === uiState.activeTab);
  });
  document.querySelectorAll('#view-examhub .v6-panel').forEach((panel) => {
    panel.hidden = panel.id !== `v6-panel-${uiState.activeTab}`;
  });
}

export function updateMistakeBadge() {
  const stats = getMistakeStats();
  const badge = document.getElementById('v6-mistake-badge');
  if (badge) {
    badge.textContent = stats.active > 0 ? String(stats.active) : '';
    badge.hidden = stats.active === 0;
  }
}

async function renderActiveV6Panel() {
  switch (uiState.activeTab) {
    case 'formulas':
      await renderFormulaPanel();
      break;
    case 'mistakes':
      renderMistakePanel();
      break;
    case 'cbt':
      await renderCbtPanel();
      break;
    case 'board':
      await renderBoardPanel();
      break;
    case 'syllabus':
      renderSyllabusPanel();
      break;
    case 'packs':
      await renderPacksPanel();
      break;
    case 'blur':
    case 'radar':
    case 'battle':
    case 'sleep':
    case 'garden':
      await renderV7Panel(uiState.activeTab);
      break;
    case 'diagram':
    case 'arcade':
    case 'percentile':
      await renderV71Panel(uiState.activeTab);
      break;
    case 'pdfs':
      await renderNcertPdfHubPanel({ onDataImported: callbacks.onDataImported });
      break;
  }
}

// ============================================================================
// PANEL 1: AUTO FORMULA SHEET & BLANK RECALL DRILL
// ============================================================================

async function renderFormulaPanel() {
  const container = document.getElementById('v6-panel-formulas');
  if (!container) return;

  const notes = await listNotes();
  const allFormulas = extractFormulasFromNotes(notes);
  const subjects = ['All', ...new Set(allFormulas.map((f) => f.subject))];
  if (!subjects.includes(uiState.formulaSubject)) uiState.formulaSubject = 'All';

  const filtered =
    uiState.formulaSubject === 'All'
      ? allFormulas
      : allFormulas.filter((f) => f.subject === uiState.formulaSubject);

  const gotCount = filtered.filter((f) => uiState.formulaGotIt.has(f.id)).length;

  container.innerHTML = `
    <div class="glass-card v6-card">
      <div class="v6-toolbar">
        <div>
          <h3 class="section-heading" style="margin:0;">Auto Formula Sheet &amp; Blank Recall Drill</h3>
          <p class="item-sub" style="margin:4px 0 0;">Automatically extracted from your notes (${allFormulas.length} formulas found).</p>
        </div>
        <div class="btn-row" style="margin:0;">
          <button id="v6-btn-blank-toggle" class="btn ${uiState.formulaBlankMode ? 'btn-primary' : 'btn-secondary'} btn-sm" type="button">
            ${uiState.formulaBlankMode ? '👁️ Blank Drill: ON' : '🧠 Start Blank Recall Drill'}
          </button>
          <button id="v6-btn-print-formulas" class="btn btn-secondary btn-sm" type="button" ${filtered.length ? '' : 'disabled'}>
            🖨️ Print Cheat Sheet
          </button>
        </div>
      </div>

      ${
        subjects.length > 1
          ? `<div class="v6-pill-row" id="v6-formula-subjects">
              ${subjects
                .map(
                  (s) =>
                    `<button class="v6-filter-pill ${s === uiState.formulaSubject ? 'active' : ''}" data-subj="${escapeHtml(s)}" type="button">${escapeHtml(s)}</button>`
                )
                .join('')}
            </div>`
          : ''
      }

      ${
        uiState.formulaBlankMode && filtered.length
          ? `<div class="v6-drill-banner">
              <span>Tap any blanked formula to reveal the RHS, then mark <strong>Got it</strong>.</span>
              <span class="pill">Mastered: ${gotCount} / ${filtered.length}</span>
            </div>`
          : ''
      }

      ${
        !filtered.length
          ? `<div class="empty-state" style="padding:28px 16px;">
              <p class="empty-title">No formulas extracted yet</p>
              <p class="item-sub">Add notes with equations (e.g. <code>V = I × R</code> or <code>K_max = hν - φ0</code>) or import a free JEE/Board Starter Pack in 1 tap!</p>
              <button id="v6-go-packs-from-formulas" class="btn btn-primary btn-sm" type="button" style="margin-top:10px;">Browse Free Starter Packs</button>
            </div>`
          : `<div class="v6-formula-grid">
              ${filtered
                .map((f) => {
                  const isRevealed = !uiState.formulaBlankMode || uiState.formulaRevealed.has(f.id);
                  const isGot = uiState.formulaGotIt.has(f.id);
                  return `
                  <article class="v6-formula-card ${isGot ? 'is-got' : ''}" data-fid="${escapeHtml(f.id)}">
                    <div class="v6-formula-meta">
                      <span class="v6-mini-tag">${escapeHtml(f.subject)}</span>
                      <span class="item-sub">${escapeHtml(f.label)}</span>
                    </div>
                    <div class="v6-formula-expr ${isRevealed ? '' : 'is-masked'}" data-reveal-fid="${escapeHtml(f.id)}">
                      ${isRevealed ? escapeHtml(f.expression) : escapeHtml(f.blanked)}
                    </div>
                    ${
                      uiState.formulaBlankMode
                        ? `<div class="v6-formula-actions">
                            <button class="btn btn-ghost btn-sm" data-reveal-btn="${escapeHtml(f.id)}" type="button">${isRevealed ? 'Hide' : 'Reveal RHS'}</button>
                            <button class="btn ${isGot ? 'btn-primary' : 'btn-secondary'} btn-sm" data-got-btn="${escapeHtml(f.id)}" type="button">${isGot ? '✓ Got It' : 'Mark Got It'}</button>
                          </div>`
                        : ''
                    }
                  </article>`;
                })
                .join('')}
            </div>`
      }
    </div>
  `;

  container.querySelector('#v6-btn-blank-toggle')?.addEventListener('click', () => {
    uiState.formulaBlankMode = !uiState.formulaBlankMode;
    if (uiState.formulaBlankMode) uiState.formulaRevealed.clear();
    renderFormulaPanel();
  });

  container.querySelector('#v6-btn-print-formulas')?.addEventListener('click', () => {
    const html = buildPrintableFormulaHtml(
      filtered,
      uiState.formulaSubject === 'All' ? 'FLIPNOTE Formula Cheat Sheet' : `${uiState.formulaSubject} Formula Sheet`
    );
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) {
      showToast('Allow pop-ups to print your Formula Cheat Sheet.');
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 250);
  });

  container.querySelector('#v6-go-packs-from-formulas')?.addEventListener('click', () => {
    refreshV6ExamHub('packs');
  });

  container.querySelectorAll('#v6-formula-subjects .v6-filter-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      uiState.formulaSubject = btn.dataset.subj;
      renderFormulaPanel();
    });
  });

  container.querySelectorAll('[data-reveal-fid], [data-reveal-btn]').forEach((el) => {
    el.addEventListener('click', () => {
      if (!uiState.formulaBlankMode) return;
      const fid = el.dataset.revealFid || el.dataset.revealBtn;
      if (uiState.formulaRevealed.has(fid)) uiState.formulaRevealed.delete(fid);
      else uiState.formulaRevealed.add(fid);
      renderFormulaPanel();
    });
  });

  container.querySelectorAll('[data-got-btn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const fid = btn.dataset.gotBtn;
      if (uiState.formulaGotIt.has(fid)) uiState.formulaGotIt.delete(fid);
      else uiState.formulaGotIt.add(fid);
      renderFormulaPanel();
    });
  });
}

// ============================================================================
// PANEL 2: AUTO MISTAKE NOTEBOOK
// ============================================================================

function renderMistakePanel() {
  const container = document.getElementById('v6-panel-mistakes');
  if (!container) return;

  const all = getMistakes();
  const stats = getMistakeStats(all);
  const retestPool = buildRetestQuestions(all);

  const visible = all.filter((m) => {
    if (!uiState.mistakeShowMastered && m.mastered) return false;
    if (uiState.mistakeFilterTag !== 'All' && m.tag !== uiState.mistakeFilterTag) return false;
    return true;
  });

  container.innerHTML = `
    <div class="glass-card v6-card">
      <div class="v6-toolbar">
        <div>
          <h3 class="section-heading" style="margin:0;">Auto Mistake Notebook</h3>
          <p class="item-sub" style="margin:4px 0 0;">Every wrong answer from Quiz &amp; JEE CBT is auto-saved here so you never repeat the same mistake.</p>
        </div>
        <div class="btn-row" style="margin:0;">
          <button id="v6-btn-retest-mistakes" class="btn btn-primary btn-sm" type="button" ${retestPool.length ? '' : 'disabled'}>
            🔁 Re-Test Mistakes (${retestPool.length})
          </button>
          <button id="v6-btn-toggle-mastered" class="btn btn-secondary btn-sm" type="button">
            ${uiState.mistakeShowMastered ? 'Hide Mastered' : `Show Mastered (${stats.mastered})`}
          </button>
        </div>
      </div>

      <div class="v6-stats-strip">
        <div class="v6-stat-chip"><strong>${stats.active}</strong><span>Active Mistakes</span></div>
        <div class="v6-stat-chip"><strong>${stats.byTag['Silly Mistake'] || 0}</strong><span>Silly Mistakes</span></div>
        <div class="v6-stat-chip"><strong>${stats.byTag['Formula Forgot'] || 0}</strong><span>Formula Forgot</span></div>
        <div class="v6-stat-chip"><strong>${stats.byTag['Concept Gap'] || 0}</strong><span>Concept Gaps</span></div>
        <div class="v6-stat-chip"><strong>${stats.mastered}</strong><span>Mastered ✓</span></div>
      </div>

      <div class="v6-pill-row" id="v6-mistake-filters">
        ${['All', ...MISTAKE_TAGS]
          .map(
            (tag) =>
              `<button class="v6-filter-pill ${tag === uiState.mistakeFilterTag ? 'active' : ''}" data-mtag="${escapeHtml(tag)}" type="button">${escapeHtml(tag)}</button>`
          )
          .join('')}
      </div>

      ${
        !visible.length
          ? `<div class="empty-state" style="padding:28px 16px;">
              <p class="empty-title">${stats.total === 0 ? 'Zero mistakes logged yet!' : 'No mistakes match this filter'}</p>
              <p class="item-sub">Take a Quiz or NTA JEE CBT Test — any wrong answer will automatically land here with root-cause tagging.</p>
              <button id="v6-go-cbt-from-mistakes" class="btn btn-primary btn-sm" type="button" style="margin-top:10px;">Launch JEE CBT Test</button>
            </div>`
          : `<div class="v6-mistake-list">
              ${visible
                .map(
                  (m) => `
                <article class="v6-mistake-card ${m.mastered ? 'is-mastered' : ''}">
                  <div class="v6-mistake-head">
                    <div class="v6-mistake-badges">
                      <span class="v6-mini-tag">${escapeHtml(m.subject || 'General')}</span>
                      <span class="v6-mini-tag v6-tag-warn">Missed ×${m.wrongCount || 1}</span>
                      <span class="v6-mini-tag">${escapeHtml(m.source || 'Quiz')}</span>
                    </div>
                    <div class="btn-row" style="margin:0;">
                      <button class="btn btn-ghost btn-sm" data-m-master="${escapeHtml(m.id)}" type="button">${m.mastered ? '↩ Re-open' : '✓ Mastered'}</button>
                      <button class="btn btn-ghost btn-sm" data-m-del="${escapeHtml(m.id)}" type="button" aria-label="Delete mistake">✕</button>
                    </div>
                  </div>
                  <p class="v6-mistake-q">${escapeHtml(m.question)}</p>
                  <div class="v6-mistake-ans">
                    ${m.lastWrongAnswer ? `<span class="v6-ans-wrong">Your answer: ${escapeHtml(m.lastWrongAnswer)}</span>` : ''}
                    <span class="v6-ans-right">Correct: ${escapeHtml(m.correctAnswer || '—')}</span>
                  </div>
                  ${m.explanation ? `<p class="item-sub" style="margin:6px 0 10px;">💡 ${escapeHtml(m.explanation)}</p>` : ''}
                  <div class="v6-mistake-controls">
                    <select class="select v6-tag-select" data-m-tag="${escapeHtml(m.id)}" aria-label="Error reason">
                      ${MISTAKE_TAGS.map(
                        (t) => `<option value="${escapeHtml(t)}" ${t === m.tag ? 'selected' : ''}>${escapeHtml(t)}</option>`
                      ).join('')}
                    </select>
                    <input class="input v6-note-input" data-m-note="${escapeHtml(m.id)}" type="text" placeholder="Write quick fix / trick to remember..." value="${escapeHtml(m.note || '')}" />
                  </div>
                </article>`
                )
                .join('')}
            </div>`
      }
    </div>
  `;

  container.querySelector('#v6-btn-retest-mistakes')?.addEventListener('click', () => {
    const qs = buildRetestQuestions(getMistakes());
    if (!qs.length) return;
    if (typeof callbacks.onOpenRetest === 'function') {
      callbacks.onOpenRetest(qs, 'Mistake Notebook Re-Test');
    }
  });

  container.querySelector('#v6-btn-toggle-mastered')?.addEventListener('click', () => {
    uiState.mistakeShowMastered = !uiState.mistakeShowMastered;
    renderMistakePanel();
  });

  container.querySelector('#v6-go-cbt-from-mistakes')?.addEventListener('click', () => {
    refreshV6ExamHub('cbt');
  });

  container.querySelectorAll('#v6-mistake-filters .v6-filter-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      uiState.mistakeFilterTag = btn.dataset.mtag;
      renderMistakePanel();
    });
  });

  container.querySelectorAll('[data-m-tag]').forEach((sel) => {
    sel.addEventListener('change', () => {
      updateMistake(sel.dataset.mTag, { tag: sel.value });
      renderMistakePanel();
    });
  });

  container.querySelectorAll('[data-m-note]').forEach((inp) => {
    inp.addEventListener('change', () => {
      updateMistake(inp.dataset.mNote, { note: inp.value.trim() });
      showToast('Fix note saved.');
    });
  });

  container.querySelectorAll('[data-m-master]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.mMaster;
      const item = getMistakes().find((x) => x.id === id);
      if (item) {
        updateMistake(id, { mastered: !item.mastered });
        updateMistakeBadge();
        renderMistakePanel();
      }
    });
  });

  container.querySelectorAll('[data-m-del]').forEach((btn) => {
    btn.addEventListener('click', () => {
      deleteMistake(btn.dataset.mDel);
      updateMistakeBadge();
      renderMistakePanel();
    });
  });
}

// ============================================================================
// PANEL 3: NTA JEE CBT EXAM SIMULATOR
// ============================================================================

async function renderCbtPanel() {
  const container = document.getElementById('v6-panel-cbt');
  if (!container) return;

  // STATE C: Post-Test Scorecard
  if (!uiState.cbtActive && uiState.cbtResult) {
    const r = uiState.cbtResult;
    container.innerHTML = `
      <div class="glass-card v6-card">
        <div class="v6-toolbar">
          <div>
            <span class="v6-mini-tag">NTA CBT SCORECARD • ${escapeHtml(r.scheme.label)}</span>
            <h3 class="section-heading" style="margin:6px 0 0;">Score: ${r.score} / ${r.maxScore}</h3>
          </div>
          <div class="btn-row" style="margin:0;">
            <button id="v6-cbt-open-radar" class="btn btn-primary btn-sm" type="button">📡 View Speed Radar</button>
            <button id="v6-cbt-new" class="btn btn-secondary btn-sm" type="button">New CBT Test</button>
            ${
              r.missedQuestions.length
                ? `<button id="v6-cbt-open-mistakes" class="btn btn-secondary btn-sm" type="button">Review ${r.missedQuestions.length} Mistakes</button>`
                : ''
            }
          </div>
        </div>

        <div class="v6-stats-strip">
          <div class="v6-stat-chip"><strong>${r.accuracy}%</strong><span>Accuracy</span></div>
          <div class="v6-stat-chip"><strong style="color:var(--success);">${r.correct}</strong><span>Correct</span></div>
          <div class="v6-stat-chip"><strong style="color:var(--danger);">${r.wrong}</strong><span>Wrong</span></div>
          <div class="v6-stat-chip"><strong>${r.unattempted}</strong><span>Skipped</span></div>
        </div>

        ${(() => {
          const p = predictJeePercentile(r.score, r.maxScore || 100);
          return `
          <div id="v71-cbt-percentile-banner" class="v6-board-prompt" style="margin-top:14px;">
            📊 <strong>Est. JEE Main Percentile: ${p.percentile}%ile</strong> (Scaled ${p.scaled300}/300 • Est. AIR ~${p.estimatedRank.toLocaleString()})${p.nextMilestone ? ` — <strong>+${p.gapMarks} marks</strong> needed for ${escapeHtml(p.nextMilestone.label)}` : ''}
          </div>`;
        })()}

        <h4 class="section-heading" style="margin-top:16px;">Subject-Wise Breakdown</h4>
        <div class="v6-subject-grid">
          ${r.bySubject
            .map(
              (s) => `
            <div class="v6-subj-score-card">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong>${escapeHtml(s.subject)}</strong>
                <span class="pill">${s.score} / ${s.maxScore}</span>
              </div>
              <p class="item-sub" style="margin:6px 0 0;">✓ ${s.correct} • ✕ ${s.wrong} • — ${s.unattempted}</p>
            </div>`
            )
            .join('')}
        </div>

        ${
          r.missedQuestions.length
            ? `<p class="item-sub" style="margin-top:14px;">✅ All <strong>${r.missedQuestions.length}</strong> wrong answers were automatically saved to your <strong>Mistake Notebook</strong>.</p>`
            : `<p class="item-sub" style="margin-top:14px; color:var(--success);">🔥 Zero negative marks! Clean accuracy.</p>`
        }
      </div>
    `;

    container.querySelector('#v6-cbt-open-radar')?.addEventListener('click', () => {
      refreshV6ExamHub('radar');
    });
    container.querySelector('#v6-cbt-new')?.addEventListener('click', () => {
      uiState.cbtResult = null;
      renderCbtPanel();
    });
    container.querySelector('#v6-cbt-open-mistakes')?.addEventListener('click', () => {
      refreshV6ExamHub('mistakes');
    });
    return;
  }

  // STATE A: CBT Setup Screen
  if (!uiState.cbtActive) {
    container.innerHTML = `
      <div class="glass-card v6-card">
        <span class="v6-mini-tag">NTA COMPUTER-BASED TEST INTERFACE</span>
        <h3 class="section-heading" style="margin:8px 0 4px;">JEE Main / Board CBT Exam Simulator</h3>
        <p class="item-sub" style="margin:0 0 16px;">Authentic NTA Question Palette (Green/Red/Purple), negative marking, live timer, and automatic Mistake Notebook sync.</p>

        <div class="v6-form-grid">
          <div class="field-group">
            <label class="field-label" for="v6-cbt-scheme">Marking Scheme</label>
            <select id="v6-cbt-scheme" class="select">
              ${Object.values(MARKING_SCHEMES)
                .map(
                  (s) =>
                    `<option value="${escapeHtml(s.id)}" ${s.id === uiState.cbtScheme ? 'selected' : ''}>${escapeHtml(s.label)}</option>`
                )
                .join('')}
            </select>
          </div>
          <div class="field-group">
            <label class="field-label" for="v6-cbt-subject">Subject Filter</label>
            <select id="v6-cbt-subject" class="select">
              <option value="All">All Subjects (PCM / Notes)</option>
              <option value="Physics">Physics</option>
              <option value="Chemistry">Chemistry</option>
              <option value="Mathematics">Mathematics</option>
              <option value="Science">Science (Class 10)</option>
            </select>
          </div>
          <div class="field-group">
            <label class="field-label" for="v6-cbt-count">Questions</label>
            <select id="v6-cbt-count" class="select">
              <option value="10">10 Questions (15 min)</option>
              <option value="15" selected>15 Questions (25 min)</option>
              <option value="25">25 Questions (45 min)</option>
            </select>
          </div>
        </div>

        <div class="btn-row" style="margin-top:14px;">
          <button id="v6-cbt-start" class="btn btn-primary" type="button">🚀 Start NTA CBT Exam</button>
        </div>
      </div>
    `;

    container.querySelector('#v6-cbt-start')?.addEventListener('click', async () => {
      const schemeId = container.querySelector('#v6-cbt-scheme')?.value || 'jee';
      const subjectFilter = container.querySelector('#v6-cbt-subject')?.value || 'All';
      const count = Number(container.querySelector('#v6-cbt-count')?.value || 15);
      const mins = count <= 10 ? 15 : count <= 15 ? 25 : 45;

      const [notes, quizzes] = await Promise.all([listNotes(), listQuizzes()]);
      const pool = buildCbtQuestionPool({ notes, quizzes, subjectFilter, count, includeBuiltinFallback: true });
      if (!pool.length) {
        showToast('Add some notes or select All Subjects to start CBT.');
        return;
      }

      uiState.cbtActive = true;
      uiState.cbtResult = null;
      uiState.cbtScheme = schemeId;
      uiState.cbtQuestions = pool;
      uiState.cbtIndex = 0;
      uiState.cbtResponses = {};
      uiState.cbtTimings = {};
      uiState.cbtQuestionEnteredAt = Date.now();
      uiState.cbtResponses[pool[0].id] = { selectedIndex: null, marked: false, visited: true };
      uiState.cbtTimerSec = mins * 60;

      stopCbtTimer();
      uiState.cbtTimerHandle = setInterval(() => {
        uiState.cbtTimerSec = Math.max(0, uiState.cbtTimerSec - 1);
        const clockEl = document.getElementById('v6-cbt-clock');
        if (clockEl) clockEl.textContent = `⏱ ${formatClock(uiState.cbtTimerSec)}`;
        if (uiState.cbtTimerSec === 0) {
          submitActiveCbt();
        }
      }, 1000);

      renderCbtPanel();
    });
    return;
  }

  // STATE B: Live NTA CBT Exam Interface
  const q = uiState.cbtQuestions[uiState.cbtIndex];
  const resp = uiState.cbtResponses[q.id] || { selectedIndex: null, marked: false, visited: true };
  uiState.cbtResponses[q.id] = { ...resp, visited: true };
  const scheme = MARKING_SCHEMES[uiState.cbtScheme] || MARKING_SCHEMES.jee;

  const paletteHtml = uiState.cbtQuestions
    .map((item, idx) => {
      const r = uiState.cbtResponses[item.id];
      let cls = 'cbt-not-visited';
      if (r) {
        const hasAns = typeof r.selectedIndex === 'number';
        if (hasAns && r.marked) cls = 'cbt-ans-marked';
        else if (r.marked) cls = 'cbt-marked';
        else if (hasAns) cls = 'cbt-answered';
        else if (r.visited) cls = 'cbt-not-answered';
      }
      if (idx === uiState.cbtIndex) cls += ' is-current';
      return `<button class="v6-palette-btn ${cls}" data-cbt-jump="${idx}" type="button">${idx + 1}</button>`;
    })
    .join('');

  container.innerHTML = `
    <div class="v6-cbt-shell">
      <div class="glass-card v6-cbt-main">
        <div class="v6-cbt-topbar">
          <div>
            <span class="v6-mini-tag">${escapeHtml(q.subject)}</span>
            <span class="v6-mini-tag">${escapeHtml(scheme.label)}</span>
          </div>
          <div style="display:flex; align-items:center; gap:10px;">
            <span id="v6-cbt-clock" class="v6-cbt-timer">⏱ ${formatClock(uiState.cbtTimerSec)}</span>
            <button id="v6-cbt-submit" class="btn btn-danger btn-sm" type="button">Submit Test</button>
          </div>
        </div>

        <p class="item-sub" style="margin:10px 0 4px;">Question ${uiState.cbtIndex + 1} of ${uiState.cbtQuestions.length}</p>
        <h3 class="v6-cbt-qtext">${escapeHtml(q.question)}</h3>

        <div class="v6-cbt-options">
          ${q.options
            .map(
              (opt, idx) => `
            <button class="v6-cbt-opt ${resp.selectedIndex === idx ? 'selected' : ''}" data-cbt-opt="${idx}" type="button">
              <span class="v6-opt-letter">${String.fromCharCode(65 + idx)}</span>
              <span>${escapeHtml(opt)}</span>
            </button>`
            )
            .join('')}
        </div>

        <div class="v6-cbt-actions">
          <button id="v6-cbt-save-next" class="btn btn-primary btn-sm" type="button">Save &amp; Next →</button>
          <button id="v6-cbt-mark-next" class="btn btn-secondary btn-sm" type="button">🟣 Mark for Review &amp; Next</button>
          <button id="v6-cbt-clear" class="btn btn-ghost btn-sm" type="button">Clear Response</button>
          <button id="v71-rough-toggle" class="btn btn-secondary btn-sm" type="button">📝 Rough Sheet</button>
        </div>

        <div id="v71-rough-drawer" class="v71-rough-drawer" hidden>
          <div class="v71-rough-tools">
            <span class="item-sub" style="font-weight:600;">In-Test Rough Sheet</span>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              <button class="v6-filter-pill active" data-pen-color="#f8fafc" type="button">White</button>
              <button class="v6-filter-pill" data-pen-color="#34d399" type="button">Mint</button>
              <button class="v6-filter-pill" data-pen-color="#fbbf24" type="button">Amber</button>
              <button id="v71-rough-eraser" class="v6-filter-pill" type="button">Eraser</button>
              <button id="v71-rough-clear" class="v6-filter-pill" type="button">Clear</button>
            </div>
          </div>
          <canvas id="v71-rough-canvas" class="v71-rough-canvas" width="760" height="240"></canvas>
        </div>
      </div>

      <aside class="glass-card v6-cbt-palette-card">
        <h4 class="section-heading" style="margin:0 0 10px;">Question Palette</h4>
        <div class="v6-palette-grid">${paletteHtml}</div>
        <div class="v6-palette-legend">
          <span><i class="dot cbt-answered"></i> Answered</span>
          <span><i class="dot cbt-not-answered"></i> Not Answered</span>
          <span><i class="dot cbt-marked"></i> Marked</span>
          <span><i class="dot cbt-ans-marked"></i> Ans + Marked</span>
          <span><i class="dot cbt-not-visited"></i> Not Visited</span>
        </div>
      </aside>
    </div>
  `;

  container.querySelectorAll('[data-cbt-opt]').forEach((btn) => {
    btn.addEventListener('click', () => {
      uiState.cbtResponses[q.id] = {
        ...uiState.cbtResponses[q.id],
        selectedIndex: Number(btn.dataset.cbtOpt),
        visited: true
      };
      renderCbtPanel();
    });
  });

  container.querySelector('#v6-cbt-save-next')?.addEventListener('click', () => {
    uiState.cbtResponses[q.id] = { ...uiState.cbtResponses[q.id], marked: false, visited: true };
    flushCurrentCbtQuestionTime();
    if (uiState.cbtIndex + 1 < uiState.cbtQuestions.length) uiState.cbtIndex++;
    renderCbtPanel();
  });

  container.querySelector('#v6-cbt-mark-next')?.addEventListener('click', () => {
    uiState.cbtResponses[q.id] = { ...uiState.cbtResponses[q.id], marked: true, visited: true };
    flushCurrentCbtQuestionTime();
    if (uiState.cbtIndex + 1 < uiState.cbtQuestions.length) uiState.cbtIndex++;
    renderCbtPanel();
  });

  container.querySelector('#v6-cbt-clear')?.addEventListener('click', () => {
    uiState.cbtResponses[q.id] = { selectedIndex: null, marked: false, visited: true };
    renderCbtPanel();
  });

  container.querySelectorAll('[data-cbt-jump]').forEach((btn) => {
    btn.addEventListener('click', () => {
      flushCurrentCbtQuestionTime();
      uiState.cbtIndex = Number(btn.dataset.cbtJump);
      renderCbtPanel();
    });
  });

  container.querySelector('#v6-cbt-submit')?.addEventListener('click', () => {
    submitActiveCbt();
  });

  initCbtRoughSheet(container);
}

async function submitActiveCbt() {
  flushCurrentCbtQuestionTime();
  stopCbtTimer();
  const radarReport = buildSpeedRadarReport(uiState.cbtQuestions, uiState.cbtResponses, uiState.cbtTimings, 45);
  saveSpeedRadarReport(radarReport);
  const result = scoreCbtAttempt(uiState.cbtQuestions, uiState.cbtResponses, uiState.cbtScheme);
  uiState.cbtActive = false;
  uiState.cbtResult = result;

  // Auto-log wrong answers to Mistake Notebook
  if (result.missedQuestions.length) {
    logMistakes(result.missedQuestions, { source: `CBT (${result.scheme.label})` });
    updateMistakeBadge();
  }

  // Record in standard FLIPNOTE progress history
  try {
    await recordQuizAttempt({
      title: `CBT Test (${result.scheme.label})`,
      score: result.correct,
      total: result.total,
      missedQuestions: result.missedQuestions
    });
    if (typeof callbacks.onLogSession === 'function') {
      await callbacks.onLogSession('quiz', result.total);
    }
  } catch {
    // Non-fatal
  }

  renderCbtPanel();
}

// ============================================================================
// PANEL 4: BOARD 3-MARK / 5-MARK NCERT KEYWORD ANSWER CHECKER
// ============================================================================

async function renderBoardPanel() {
  const container = document.getElementById('v6-panel-board');
  if (!container) return;

  const notes = await listNotes();
  const sampleMatch = BOARD_SAMPLE_QUESTIONS.find((q) => q.id === uiState.boardSourceId);
  const noteMatch = !sampleMatch ? notes.find((n) => `note:${n.id}` === uiState.boardSourceId) : null;
  const activeSample = sampleMatch || (!noteMatch ? BOARD_SAMPLE_QUESTIONS[0] : null);

  if (activeSample && !noteMatch) {
    uiState.boardSourceId = activeSample.id;
  }

  const promptTitle = activeSample
    ? `[${activeSample.board} • ${activeSample.marks} Marks] ${activeSample.question}`
    : `Write a Board-style answer summarizing your note: "${noteMatch.title}"`;

  const res = uiState.boardLastResult;

  container.innerHTML = `
    <div class="glass-card v6-card">
      <div class="v6-toolbar">
        <div>
          <h3 class="section-heading" style="margin:0;">Board 3-Mark / 5-Mark NCERT Answer Checker</h3>
          <p class="item-sub" style="margin:4px 0 0;">Practice subjective Board answers and check NCERT keywords, word count, and topper structure offline.</p>
        </div>
        <div class="segmented-control" style="max-width:210px;">
          <button class="segmented-btn ${uiState.boardMarks === 3 ? 'active' : ''}" data-bmarks="3" type="button">3 Marks</button>
          <button class="segmented-btn ${uiState.boardMarks === 5 ? 'active' : ''}" data-bmarks="5" type="button">5 Marks</button>
        </div>
      </div>

      <div class="field-group" style="margin-top:12px;">
        <label class="field-label" for="v6-board-source">Choose Board Question or Your Saved Note</label>
        <select id="v6-board-source" class="select">
          <optgroup label="NCERT Board Sample Questions (Class 10 &amp; 12)">
            ${BOARD_SAMPLE_QUESTIONS.map(
              (q) =>
                `<option value="${escapeHtml(q.id)}" ${q.id === uiState.boardSourceId ? 'selected' : ''}>${escapeHtml(q.board)} (${q.marks}M) — ${escapeHtml(q.question.slice(0, 68))}</option>`
            ).join('')}
          </optgroup>
          ${
            notes.length
              ? `<optgroup label="Your Saved Notes">
                  ${notes
                    .map(
                      (n) =>
                        `<option value="note:${escapeHtml(n.id)}" ${`note:${n.id}` === uiState.boardSourceId ? 'selected' : ''}>Note: ${escapeHtml(n.title)}</option>`
                    )
                    .join('')}
                </optgroup>`
              : ''
          }
        </select>
      </div>

      <div class="v6-board-prompt">${escapeHtml(promptTitle)}</div>

      <div class="field-group">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <label class="field-label" for="v6-board-answer" style="margin:0;">Your Subjective Answer</label>
          <button id="v6-board-voice" class="btn btn-secondary btn-sm" type="button">🎙️ Voice Dictate</button>
        </div>
        <textarea id="v6-board-answer" class="textarea" rows="6" placeholder="Write in numbered points with key NCERT terms and formulas..."></textarea>
      </div>

      <div class="btn-row">
        <button id="v6-board-eval" class="btn btn-primary" type="button">✓ Check My Board Answer</button>
        ${activeSample ? `<button id="v6-board-show-model" class="btn btn-secondary btn-sm" type="button">👁️ View NCERT Model Answer</button>` : ''}
      </div>

      ${
        activeSample
          ? `<div id="v6-board-model-box" class="v6-model-box" hidden>
              <strong>NCERT Model Answer:</strong>
              <p style="margin:6px 0 0;">${escapeHtml(activeSample.modelAnswer)}</p>
            </div>`
          : ''
      }

      ${
        res
          ? `<div class="v6-board-result">
              <div class="v6-board-score-row">
                <div>
                  <span class="v6-mini-tag">ESTIMATED BOARD SCORE</span>
                  <h4 style="margin:6px 0 2px; font-size:1.5rem;">${res.estimatedMarks} / ${res.maxMarks} Marks <span class="item-sub">(${res.percent}%)</span></h4>
                  <p class="item-sub" style="margin:0;">${escapeHtml(res.verdict)}</p>
                </div>
                <div class="pill">Words: ${res.wordCount} (Ideal: ${escapeHtml(res.idealRange)})</div>
              </div>

              <div class="v6-kw-section">
                <p class="field-label" style="margin:10px 0 6px;">Matched NCERT Keywords (${res.matchedKeywords.length})</p>
                <div class="v6-kw-chips">
                  ${
                    res.matchedKeywords.length
                      ? res.matchedKeywords.map((k) => `<span class="kw-chip kw-hit">✓ ${escapeHtml(k)}</span>`).join('')
                      : '<span class="item-sub">None matched yet</span>'
                  }
                </div>
                <p class="field-label" style="margin:10px 0 6px;">Missing NCERT Keywords (${res.missedKeywords.length})</p>
                <div class="v6-kw-chips">
                  ${
                    res.missedKeywords.length
                      ? res.missedKeywords.map((k) => `<span class="kw-chip kw-miss">+ ${escapeHtml(k)}</span>`).join('')
                      : '<span class="item-sub" style="color:var(--success);">All key NCERT terms covered!</span>'
                  }
                </div>
              </div>

              <ul class="v6-tips-list">
                ${res.structureTips.map((tip) => `<li>${escapeHtml(tip)}</li>`).join('')}
              </ul>
            </div>`
          : ''
      }
    </div>
  `;

  container.querySelectorAll('[data-bmarks]').forEach((btn) => {
    btn.addEventListener('click', () => {
      uiState.boardMarks = Number(btn.dataset.bmarks);
      renderBoardPanel();
    });
  });

  container.querySelector('#v6-board-source')?.addEventListener('change', (e) => {
    uiState.boardSourceId = e.target.value;
    const found = BOARD_SAMPLE_QUESTIONS.find((q) => q.id === uiState.boardSourceId);
    if (found) uiState.boardMarks = found.marks;
    uiState.boardLastResult = null;
    renderBoardPanel();
  });

  container.querySelector('#v6-board-show-model')?.addEventListener('click', () => {
    const box = container.querySelector('#v6-board-model-box');
    if (box) box.hidden = !box.hidden;
  });

  container.querySelector('#v6-board-voice')?.addEventListener('click', () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      showToast('Voice dictation is not supported in this browser.');
      return;
    }
    const ta = container.querySelector('#v6-board-answer');
    const rec = new SR();
    rec.lang = 'en-IN';
    rec.interimResults = false;
    rec.onresult = (ev) => {
      const transcript = ev.results?.[0]?.[0]?.transcript || '';
      if (ta && transcript) {
        ta.value = `${ta.value}${ta.value ? ' ' : ''}${transcript}`;
      }
    };
    rec.onerror = () => showToast('Could not capture voice. Check mic permissions.');
    rec.start();
    showToast('Listening... speak your Board answer.');
  });

  container.querySelector('#v6-board-eval')?.addEventListener('click', () => {
    const answerText = container.querySelector('#v6-board-answer')?.value || '';
    if (!answerText.trim()) {
      showToast('Write or dictate your answer first.');
      return;
    }
    uiState.boardLastResult = evaluateBoardAnswer({
      userAnswer: answerText,
      keywords: activeSample ? activeSample.keywords : [],
      expectedText: noteMatch ? noteMatch.content : activeSample?.modelAnswer || '',
      marksMode: uiState.boardMarks
    });
    renderBoardPanel();
    const ta = document.getElementById('v6-board-answer');
    if (ta) ta.value = answerText;
  });
}

// ============================================================================
// PANEL 5: SYLLABUS TRACKER + EXAM COUNTDOWN
// ============================================================================

function renderSyllabusPanel() {
  const container = document.getElementById('v6-panel-syllabus');
  if (!container) return;

  const tracker = loadSyllabusState();
  const countdown = computeCountdown(tracker.targetDate);
  const progress = computeSyllabusProgress(tracker);
  const subjects = ['All', ...new Set(tracker.chapters.map((c) => c.subject))];
  if (!subjects.includes(uiState.syllabusSubject)) uiState.syllabusSubject = 'All';

  const visibleChapters =
    uiState.syllabusSubject === 'All'
      ? tracker.chapters
      : tracker.chapters.filter((c) => c.subject === uiState.syllabusSubject);

  container.innerHTML = `
    <div class="glass-card v6-card">
      <div class="v6-countdown-hero ${countdown.urgent ? 'is-urgent' : ''}">
        <div>
          <span class="v6-mini-tag">TARGET EXAM COUNTDOWN</span>
          <h3 style="margin:6px 0 2px; font-size:1.55rem;">${escapeHtml(tracker.examName)}</h3>
          <p class="item-sub" style="margin:0;">Overall Mastery: <strong>${progress.overallPercent}%</strong> (${progress.masteredChapters}/${progress.totalChapters} chapters 100% done)</p>
        </div>
        <div class="v6-days-badge">
          <strong>${countdown.daysLeft}</strong>
          <span>DAYS LEFT</span>
        </div>
      </div>

      <div class="v6-form-grid" style="margin-top:14px;">
        <div class="field-group">
          <label class="field-label" for="v6-syl-preset">Exam Preset</label>
          <select id="v6-syl-preset" class="select">
            ${Object.values(SYLLABUS_PRESETS)
              .map(
                (p) =>
                  `<option value="${escapeHtml(p.id)}" ${p.id === tracker.presetId ? 'selected' : ''}>${escapeHtml(p.name)}</option>`
              )
              .join('')}
          </select>
        </div>
        <div class="field-group">
          <label class="field-label" for="v6-syl-date">Target Exam Date</label>
          <input id="v6-syl-date" class="input" type="date" value="${escapeHtml(tracker.targetDate || '')}" />
        </div>
        <div class="field-group">
          <label class="field-label" for="v6-syl-custom">Add Custom Chapter</label>
          <div style="display:flex; gap:6px;">
            <input id="v6-syl-custom" class="input" type="text" placeholder="Chapter name..." />
            <button id="v6-syl-add" class="btn btn-secondary btn-sm" type="button">+ Add</button>
          </div>
        </div>
      </div>

      <div class="v6-subject-grid" style="margin-top:12px;">
        ${progress.subjectStats
          .map(
            (s) => `
          <div class="v6-subj-score-card">
            <div style="display:flex; justify-content:space-between; font-size:0.9rem;">
              <strong>${escapeHtml(s.subject)}</strong>
              <span>${s.percent}%</span>
            </div>
            <div class="v6-progress-track"><div class="v6-progress-fill" style="width:${s.percent}%;"></div></div>
          </div>`
          )
          .join('')}
      </div>

      <div class="v6-pill-row" id="v6-syl-subjects" style="margin-top:14px;">
        ${subjects
          .map(
            (s) =>
              `<button class="v6-filter-pill ${s === uiState.syllabusSubject ? 'active' : ''}" data-ssubj="${escapeHtml(s)}" type="button">${escapeHtml(s)}</button>`
          )
          .join('')}
      </div>

      <div class="v6-chapter-list">
        ${visibleChapters
          .map((ch) => {
            const doneCount = (ch.notes ? 1 : 0) + (ch.pyq ? 1 : 0) + (ch.revised ? 1 : 0);
            return `
            <div class="v6-chapter-row ${doneCount === 3 ? 'is-complete' : ''}">
              <div class="v6-chapter-info">
                <span class="v6-mini-tag">${escapeHtml(ch.subject)}</span>
                <span class="v6-chapter-name">${escapeHtml(ch.name)}</span>
              </div>
              <div class="v6-chapter-checks">
                <label class="v6-check-pill"><input type="checkbox" data-ch-id="${escapeHtml(ch.id)}" data-ch-field="notes" ${ch.notes ? 'checked' : ''} /> Notes</label>
                <label class="v6-check-pill"><input type="checkbox" data-ch-id="${escapeHtml(ch.id)}" data-ch-field="pyq" ${ch.pyq ? 'checked' : ''} /> PYQs</label>
                <label class="v6-check-pill"><input type="checkbox" data-ch-id="${escapeHtml(ch.id)}" data-ch-field="revised" ${ch.revised ? 'checked' : ''} /> Revised</label>
              </div>
            </div>`;
          })
          .join('')}
      </div>
    </div>
  `;

  container.querySelector('#v6-syl-preset')?.addEventListener('change', (e) => {
    const next = createInitialSyllabusState(e.target.value);
    saveSyllabusState(next);
    uiState.syllabusSubject = 'All';
    renderSyllabusPanel();
    showToast(`Loaded ${next.examName} syllabus!`);
  });

  container.querySelector('#v6-syl-date')?.addEventListener('change', (e) => {
    const st = loadSyllabusState();
    st.targetDate = e.target.value;
    saveSyllabusState(st);
    renderSyllabusPanel();
  });

  container.querySelector('#v6-syl-add')?.addEventListener('click', () => {
    const inp = container.querySelector('#v6-syl-custom');
    const name = inp?.value.trim();
    if (!name) return;
    const st = loadSyllabusState();
    const subj = uiState.syllabusSubject === 'All' ? Object.keys(SYLLABUS_PRESETS[st.presetId]?.subjects || { General: [] })[0] || 'General' : uiState.syllabusSubject;
    st.chapters.unshift({ id: uid(), subject: subj, name, notes: false, pyq: false, revised: false });
    saveSyllabusState(st);
    renderSyllabusPanel();
    showToast(`Added "${name}" to ${subj}.`);
  });

  container.querySelectorAll('#v6-syl-subjects .v6-filter-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      uiState.syllabusSubject = btn.dataset.ssubj;
      renderSyllabusPanel();
    });
  });

  container.querySelectorAll('[data-ch-id]').forEach((chk) => {
    chk.addEventListener('change', () => {
      const st = loadSyllabusState();
      const ch = st.chapters.find((c) => c.id === chk.dataset.chId);
      if (ch) {
        ch[chk.dataset.chField] = chk.checked;
        saveSyllabusState(st);
        renderSyllabusPanel();
      }
    });
  });
}

// ============================================================================
// PANEL 6: 1-TAP FREE STARTER PACKS
// ============================================================================

async function renderPacksPanel() {
  const container = document.getElementById('v6-panel-packs');
  if (!container) return;

  const existingNotes = await listNotes();
  const existingTitles = new Set(existingNotes.map((n) => (n.title || '').trim().toLowerCase()));

  container.innerHTML = `
    <div class="glass-card v6-card">
      <div class="v6-toolbar">
        <div>
          <h3 class="section-heading" style="margin:0;">1-Tap Free JEE &amp; Board Starter Packs</h3>
          <p class="item-sub" style="margin:4px 0 0;">Instant offline notes, formulas, and flashcards — zero typing required. Works with Formula Sheet, CBT &amp; Study Reels!</p>
        </div>
      </div>

      <div class="v6-packs-grid">
        ${STARTER_PACKS.map((pack) => {
          const imported = existingTitles.has(pack.title.trim().toLowerCase());
          const formulaCount = extractFormulasFromNotes([{ title: pack.title, subject: pack.subject, content: pack.noteContent }]).length;
          return `
            <article class="v6-pack-card">
              <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                <span class="v6-mini-tag">${escapeHtml(pack.badge)}</span>
                <span class="item-sub">${formulaCount} Formulas • ${pack.flashcards.length} Cards</span>
              </div>
              <h4 style="margin:10px 0 6px; font-size:1.05rem;">${escapeHtml(pack.title)}</h4>
              <p class="item-sub" style="margin:0 0 14px; flex:1;">${escapeHtml(pack.description)}</p>
              <button class="btn ${imported ? 'btn-secondary' : 'btn-primary'} btn-sm" data-import-pack="${escapeHtml(pack.id)}" type="button">
                ${imported ? '✓ Imported (Re-import)' : '⚡ 1-Tap Import Free'}
              </button>
            </article>`;
        }).join('')}
      </div>
    </div>
  `;

  container.querySelectorAll('[data-import-pack]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const pack = STARTER_PACKS.find((p) => p.id === btn.dataset.importPack);
      if (!pack) return;
      btn.disabled = true;
      btn.textContent = 'Importing...';
      try {
        const savedNote = await saveNoteRecord({
          title: pack.title,
          subject: pack.subject,
          content: pack.noteContent,
          language: 'en'
        });

        const now = Date.now();
        const cards = pack.flashcards.map((c) => ({
          id: uid(),
          front: c.front,
          back: c.back,
          ease: 2.5,
          interval: 0,
          reps: 0,
          nextReviewAt: now
        }));

        await saveStudySet({
          title: pack.title,
          subject: pack.subject,
          language: 'en',
          noteId: savedNote.id,
          cards
        });

        if (typeof callbacks.onDataImported === 'function') {
          await callbacks.onDataImported();
        }
        showToast(`Imported "${pack.title}" into Notes, Flashcards & Formula Sheet!`);
        await renderPacksPanel();
      } catch (err) {
        console.error('Starter pack import failed:', err);
        showToast('Could not import pack. Please try again.');
        btn.disabled = false;
      }
    });
  });
}
