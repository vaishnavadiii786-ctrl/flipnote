// FLIPNOTE v7.1 — UI Controller for Rough Sheet, Diagram Masker, 60s Arcade & Percentile Predictor

import { uid, escapeHtml, showToast } from './utils.js';
import { listNotes } from './notes.js';
import {
  predictJeePercentile,
  getArcadeBestScore,
  saveArcadeBestScore,
  getComboMultiplier,
  buildArcadeDeck,
  loadSavedDiagrams,
  saveDiagramRecord
} from './v71.js';

const v71State = {
  // Diagram Masker
  diagramId: null,
  diagramMode: 'quiz', // 'quiz' | 'edit'
  diagramRevealed: new Set(),
  // 60s Formula Arcade
  arcadeRunning: false,
  arcadeDeck: [],
  arcadeIdx: 0,
  arcadeScore: 0,
  arcadeStreak: 0,
  arcadeBestStreak: 0,
  arcadeCorrect: 0,
  arcadeWrong: 0,
  arcadeTimeLeft: 60,
  arcadeTimer: null,
  arcadeFeedback: '',
  arcadeFinished: false,
  // Percentile Predictor
  sliderMarks: 160
};

export async function renderV71Panel(tabName) {
  switch (tabName) {
    case 'diagram':
      renderDiagramPanel();
      break;
    case 'arcade':
      await renderArcadePanel();
      break;
    case 'percentile':
      renderPercentilePanel();
      break;
  }
}

// ============================================================================
// 1. REUSABLE IN-TEST CBT ROUGH SHEET (HTML5 CANVAS SCRATCHPAD)
// ============================================================================

export function initCbtRoughSheet(container) {
  const toggleBtn = container.querySelector('#v71-rough-toggle');
  const drawer = container.querySelector('#v71-rough-drawer');
  const canvas = container.querySelector('#v71-rough-canvas');
  if (!toggleBtn || !drawer || !canvas) return;

  const ctx = canvas.getContext('2d');
  let drawing = false;
  let penColor = '#f8fafc';
  let eraser = false;
  let lastX = 0;
  let lastY = 0;

  const getPos = (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  toggleBtn.addEventListener('click', () => {
    drawer.hidden = !drawer.hidden;
    toggleBtn.textContent = drawer.hidden ? '📝 Rough Sheet' : '✕ Hide Rough Sheet';
  });

  canvas.addEventListener('pointerdown', (e) => {
    drawing = true;
    canvas.setPointerCapture?.(e.pointerId);
    const p = getPos(e);
    lastX = p.x;
    lastY = p.y;
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!drawing || !ctx) return;
    const p = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = eraser ? '#0d132b' : penColor;
    ctx.lineWidth = eraser ? 18 : 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    lastX = p.x;
    lastY = p.y;
  });

  const endDraw = () => {
    drawing = false;
  };
  canvas.addEventListener('pointerup', endDraw);
  canvas.addEventListener('pointercancel', endDraw);

  container.querySelectorAll('[data-pen-color]').forEach((btn) => {
    btn.addEventListener('click', () => {
      eraser = false;
      penColor = btn.dataset.penColor;
      container.querySelectorAll('[data-pen-color], #v71-rough-eraser').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  container.querySelector('#v71-rough-eraser')?.addEventListener('click', (e) => {
    eraser = true;
    container.querySelectorAll('[data-pen-color]').forEach((b) => b.classList.remove('active'));
    e.currentTarget.classList.add('active');
  });

  container.querySelector('#v71-rough-clear')?.addEventListener('click', () => {
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
  });
}

// ============================================================================
// 2. NCERT DIAGRAM LABEL MASKER
// ============================================================================

function renderDiagramPanel() {
  const container = document.getElementById('v6-panel-diagram');
  if (!container) return;

  const diagrams = loadSavedDiagrams();
  let current = diagrams.find((d) => d.id === v71State.diagramId) || diagrams[0];
  v71State.diagramId = current.id;

  const revealedCount = current.pins.filter((p) => v71State.diagramRevealed.has(p.id)).length;

  container.innerHTML = `
    <div class="glass-card v6-card">
      <div class="v6-toolbar">
        <div>
          <span class="v6-mini-tag">NCERT BIO / PHYSICS DIAGRAMS</span>
          <h3 class="section-heading" style="margin:6px 0 0;">Diagram Label Masker</h3>
          <p class="item-sub" style="margin:4px 0 0;">Upload any NCERT diagram, drop mask boxes on labels, and quiz yourself by tapping each pin.</p>
        </div>
        <div class="segmented-control" style="max-width:220px;">
          <button class="segmented-btn ${v71State.diagramMode === 'quiz' ? 'active' : ''}" data-dmode="quiz" type="button">Quiz Mode</button>
          <button class="segmented-btn ${v71State.diagramMode === 'edit' ? 'active' : ''}" data-dmode="edit" type="button">Edit Pins</button>
        </div>
      </div>

      <div class="v6-form-grid" style="margin-bottom:12px;">
        <div class="field-group">
          <label class="field-label" for="v71-diag-select">Saved Diagrams</label>
          <select id="v71-diag-select" class="select">
            ${diagrams
              .map(
                (d) =>
                  `<option value="${escapeHtml(d.id)}" ${d.id === current.id ? 'selected' : ''}>${escapeHtml(d.title)} (${d.pins.length} pins)</option>`
              )
              .join('')}
          </select>
        </div>
        <div class="field-group">
          <label class="field-label">Upload New Diagram Image</label>
          <label class="btn btn-secondary btn-sm" style="cursor:pointer; display:inline-flex; justify-content:center;">
            <span>📷 Choose Image (PNG/JPG)</span>
            <input id="v71-diag-upload" type="file" accept="image/*" hidden />
          </label>
        </div>
      </div>

      <div class="v6-drill-banner">
        <span>${
          v71State.diagramMode === 'edit'
            ? '✏️ Edit Mode: Click anywhere on the diagram below to drop a new label mask pin.'
            : '🧠 Quiz Mode: Recall each numbered label, then tap the blurred pill to check yourself!'
        }</span>
        <span class="pill">Revealed: ${revealedCount} / ${current.pins.length}</span>
      </div>

      <div id="v71-diag-stage" class="v71-diag-stage ${v71State.diagramMode === 'edit' ? 'is-editing' : ''}">
        <img src="${current.imageData}" alt="${escapeHtml(current.title)}" class="v71-diag-img" draggable="false" />
        ${current.pins
          .map((pin, idx) => {
            const isOpen = v71State.diagramMode === 'edit' || v71State.diagramRevealed.has(pin.id);
            return `
            <button type="button" class="v71-pin-box ${isOpen ? 'is-open' : ''}" style="left:${pin.xPct}%; top:${pin.yPct}%;" data-pin-id="${escapeHtml(pin.id)}">
              <span class="v71-pin-num">${idx + 1}</span>
              <span class="v71-pin-txt">${isOpen ? escapeHtml(pin.label) : 'Tap to reveal'}</span>
            </button>`;
          })
          .join('')}
      </div>

      <div class="btn-row" style="margin-top:12px;">
        <button id="v71-diag-reveal-all" class="btn btn-secondary btn-sm" type="button">👁️ Reveal All</button>
        <button id="v71-diag-hide-all" class="btn btn-ghost btn-sm" type="button">🙈 Hide All</button>
        ${v71State.diagramMode === 'edit' ? `<button id="v71-diag-clear-pins" class="btn btn-danger btn-sm" type="button">Clear Pins</button>` : ''}
      </div>
    </div>
  `;

  container.querySelectorAll('[data-dmode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      v71State.diagramMode = btn.dataset.dmode;
      renderDiagramPanel();
    });
  });

  container.querySelector('#v71-diag-select')?.addEventListener('change', (e) => {
    v71State.diagramId = e.target.value;
    v71State.diagramRevealed.clear();
    renderDiagramPanel();
  });

  container.querySelector('#v71-diag-upload')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const saved = saveDiagramRecord({
        id: uid(),
        title: file.name.replace(/\.[^.]+$/, ''),
        imageData: String(reader.result || ''),
        pins: []
      });
      v71State.diagramId = saved.id;
      v71State.diagramMode = 'edit';
      v71State.diagramRevealed.clear();
      showToast('Diagram uploaded! Tap anywhere on it to add label pins.');
      renderDiagramPanel();
    };
    reader.readAsDataURL(file);
  });

  container.querySelector('#v71-diag-stage')?.addEventListener('click', (e) => {
    if (v71State.diagramMode !== 'edit') return;
    if (e.target.closest('.v71-pin-box')) return;
    const stage = e.currentTarget;
    const rect = stage.getBoundingClientRect();
    const xPct = Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 10;
    const yPct = Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 10;
    const label = window.prompt('Enter NCERT label name for this pin:');
    if (!label || !label.trim()) return;
    current.pins.push({ id: uid(), xPct, yPct, label: label.trim() });
    saveDiagramRecord(current);
    renderDiagramPanel();
  });

  container.querySelectorAll('[data-pin-id]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const pid = btn.dataset.pinId;
      if (v71State.diagramMode === 'edit') {
        if (window.confirm('Delete this label pin?')) {
          current.pins = current.pins.filter((p) => p.id !== pid);
          saveDiagramRecord(current);
          renderDiagramPanel();
        }
        return;
      }
      if (v71State.diagramRevealed.has(pid)) v71State.diagramRevealed.delete(pid);
      else v71State.diagramRevealed.add(pid);
      renderDiagramPanel();
    });
  });

  container.querySelector('#v71-diag-reveal-all')?.addEventListener('click', () => {
    for (const p of current.pins) v71State.diagramRevealed.add(p.id);
    renderDiagramPanel();
  });

  container.querySelector('#v71-diag-hide-all')?.addEventListener('click', () => {
    v71State.diagramRevealed.clear();
    renderDiagramPanel();
  });

  container.querySelector('#v71-diag-clear-pins')?.addEventListener('click', () => {
    current.pins = [];
    saveDiagramRecord(current);
    renderDiagramPanel();
  });
}

// ============================================================================
// 3. 60-SECOND FORMULA ARCADE (COMBO MULTIPLIER)
// ============================================================================

function stopArcadeTimer() {
  if (v71State.arcadeTimer) {
    clearInterval(v71State.arcadeTimer);
    v71State.arcadeTimer = null;
  }
}

async function renderArcadePanel() {
  const container = document.getElementById('v6-panel-arcade');
  if (!container) return;

  const bestScore = getArcadeBestScore();

  if (v71State.arcadeRunning) {
    const card = v71State.arcadeDeck[v71State.arcadeIdx % v71State.arcadeDeck.length];
    const mult = getComboMultiplier(v71State.arcadeStreak);
    container.innerHTML = `
      <div class="glass-card v6-card v71-arcade-card">
        <div class="v6-cbt-topbar">
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <span class="v6-mini-tag">SCORE: ${v71State.arcadeScore}</span>
            <span class="v6-mini-tag ${mult >= 2 ? 'v6-tag-warn' : ''}">🔥 STREAK ${v71State.arcadeStreak} (${mult}x)</span>
          </div>
          <span id="v71-arcade-clock" class="v6-cbt-timer">⏱ ${v71State.arcadeTimeLeft}s</span>
        </div>

        <div class="v71-arcade-stage">
          <span class="v6-mini-tag">${escapeHtml(card.subject)} • ${escapeHtml(card.label)}</span>
          <p class="v71-arcade-expr">${escapeHtml(card.statement)}</p>
          <p class="item-sub" style="min-height:20px; margin:0;">${escapeHtml(v71State.arcadeFeedback)}</p>
        </div>

        <div class="v71-arcade-btns">
          <button id="v71-arc-true" class="btn btn-primary" type="button" style="background:#10b981; border:none;">✓ TRUE FORMULA</button>
          <button id="v71-arc-false" class="btn btn-danger" type="button">✕ FAKE / WRONG</button>
        </div>
      </div>
    `;

    const handleChoice = (choice) => {
      const right = choice === card.isTrue;
      if (right) {
        v71State.arcadeStreak += 1;
        v71State.arcadeBestStreak = Math.max(v71State.arcadeBestStreak, v71State.arcadeStreak);
        v71State.arcadeCorrect += 1;
        const pts = 10 * getComboMultiplier(v71State.arcadeStreak);
        v71State.arcadeScore += pts;
        v71State.arcadeFeedback = `✅ +${pts} pts! (${getComboMultiplier(v71State.arcadeStreak)}x combo)`;
      } else {
        v71State.arcadeStreak = 0;
        v71State.arcadeWrong += 1;
        v71State.arcadeFeedback = `❌ Correct: ${card.correctExpression}`;
      }
      v71State.arcadeIdx += 1;
      renderArcadePanel();
    };

    container.querySelector('#v71-arc-true')?.addEventListener('click', () => handleChoice(true));
    container.querySelector('#v71-arc-false')?.addEventListener('click', () => handleChoice(false));
    return;
  }

  if (v71State.arcadeFinished) {
    const newBest = saveArcadeBestScore(v71State.arcadeScore);
    container.innerHTML = `
      <div class="glass-card v6-card" style="text-align:center;">
        <span class="v6-mini-tag">🎮 60-SECOND ARCADE COMPLETE</span>
        <h3 class="section-heading" style="margin:10px 0 4px; font-size:2rem;">${v71State.arcadeScore} pts</h3>
        <p class="item-sub" style="margin:0 0 16px;">Personal Best: <strong>${newBest} pts</strong> • Max Streak: <strong>${v71State.arcadeBestStreak}</strong></p>
        <div class="v6-stats-strip" style="max-width:420px; margin:0 auto 16px;">
          <div class="v6-stat-chip"><strong style="color:var(--success);">${v71State.arcadeCorrect}</strong><span>Correct</span></div>
          <div class="v6-stat-chip"><strong style="color:var(--danger);">${v71State.arcadeWrong}</strong><span>Wrong</span></div>
        </div>
        <button id="v71-arc-replay" class="btn btn-primary" type="button">🔥 Play Another 60s Sprint</button>
      </div>
    `;
    container.querySelector('#v71-arc-replay')?.addEventListener('click', () => startArcadeGame());
    return;
  }

  container.innerHTML = `
    <div class="glass-card v6-card" style="text-align:center;">
      <span class="v6-mini-tag">RAPID-FIRE COMBO GAME</span>
      <h3 class="section-heading" style="margin:10px 0 6px; font-size:1.45rem;">60-Second Formula Arcade</h3>
      <p class="item-sub" style="margin:0 auto 16px; max-width:520px;">Spot real vs mutated fake formulas in 60 seconds. Build streaks for <strong>2x, 3x &amp; 5x</strong> combo multipliers!</p>
      <p class="pill" style="display:inline-flex; margin-bottom:16px;">🏆 High Score: ${bestScore} pts</p>
      <div>
        <button id="v71-arc-start" class="btn btn-primary" type="button">🎮 Start 60s Formula Arcade</button>
      </div>
    </div>
  `;

  container.querySelector('#v71-arc-start')?.addEventListener('click', () => startArcadeGame());
}

async function startArcadeGame() {
  stopArcadeTimer();
  const notes = await listNotes();
  v71State.arcadeDeck = buildArcadeDeck(notes);
  v71State.arcadeIdx = 0;
  v71State.arcadeScore = 0;
  v71State.arcadeStreak = 0;
  v71State.arcadeBestStreak = 0;
  v71State.arcadeCorrect = 0;
  v71State.arcadeWrong = 0;
  v71State.arcadeTimeLeft = 60;
  v71State.arcadeFeedback = 'Is this formula 100% TRUE or FAKE?';
  v71State.arcadeFinished = false;
  v71State.arcadeRunning = true;

  v71State.arcadeTimer = setInterval(() => {
    v71State.arcadeTimeLeft = Math.max(0, v71State.arcadeTimeLeft - 1);
    const el = document.getElementById('v71-arcade-clock');
    if (el) el.textContent = `⏱ ${v71State.arcadeTimeLeft}s`;
    if (v71State.arcadeTimeLeft === 0) {
      stopArcadeTimer();
      v71State.arcadeRunning = false;
      v71State.arcadeFinished = true;
      renderArcadePanel();
    }
  }, 1000);

  renderArcadePanel();
}

// ============================================================================
// 4. JEE PERCENTILE & RANK PREDICTOR (OFFLINE INTERACTIVE CALCULATOR)
// ============================================================================

function renderPercentilePanel() {
  const container = document.getElementById('v6-panel-percentile');
  if (!container) return;

  const pred = predictJeePercentile(v71State.sliderMarks, 300);

  container.innerHTML = `
    <div class="glass-card v6-card">
      <span class="v6-mini-tag">OFFLINE JEE MAIN CURVE</span>
      <h3 class="section-heading" style="margin:8px 0 4px;">JEE Percentile &amp; Rank Predictor</h3>
      <p class="item-sub" style="margin:0 0 16px;">Slide your mock test score (out of 300) to see estimated percentile, AIR range, and exact marks needed for the next target.</p>

      <div class="field-group" style="margin-bottom:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <label class="field-label" for="v71-pct-slider" style="margin:0;">Mock Score (out of 300)</label>
          <strong style="font-size:1.25rem; color:var(--accent);">${v71State.sliderMarks} / 300</strong>
        </div>
        <input id="v71-pct-slider" type="range" min="0" max="300" step="1" value="${v71State.sliderMarks}" style="width:100%;" />
      </div>

      <div class="v6-stats-strip">
        <div class="v6-stat-chip"><strong style="color:var(--success);">${pred.percentile}%ile</strong><span>Est. Percentile</span></div>
        <div class="v6-stat-chip"><strong>~${pred.estimatedRank.toLocaleString()}</strong><span>Est. AIR</span></div>
        <div class="v6-stat-chip"><strong>${pred.nextMilestone ? `+${pred.gapMarks} marks` : 'Top Tier!'}</strong><span>${pred.nextMilestone ? `For ${escapeHtml(pred.nextMilestone.label)}` : '99.5%+ Zone'}</span></div>
      </div>

      <div class="v6-board-prompt" style="margin-top:14px;">🎯 ${escapeHtml(pred.tier)}</div>
      <p class="item-sub" style="margin:10px 0 0; font-size:0.78rem;">Note: Offline estimate based on historical JEE Main 300-mark score-vs-percentile trends (~12.5L candidates). Actual NTA percentiles vary by shift difficulty.</p>
    </div>
  `;

  container.querySelector('#v71-pct-slider')?.addEventListener('input', (e) => {
    v71State.sliderMarks = Number(e.target.value);
    renderPercentilePanel();
  });
}
