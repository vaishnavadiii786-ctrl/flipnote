// FLIPNOTE v7.0 — 5 Unique Superpowers UI Controller
// Mounts Blur-to-Recall, Exam Hall Speed Radar, 1v1 Battle Link, Sleep Revision & Focus Garden inside #view-examhub.

import { escapeHtml, showToast } from './utils.js';
import { listNotes } from './notes.js';
import { listStudySets } from './flashcards.js';
import { extractFormulasFromNotes, BUILTIN_CBT_BANK, STARTER_PACKS } from './v6.js';
import {
  tokenizeForBlurRecall,
  loadSpeedRadarReport,
  encodeBattlePayload,
  decodeBattlePayload,
  computeBattleWinner,
  createSleepNoiseEngine,
  loadFocusGarden,
  recordGardenPlant,
  getPlantGrowthStage
} from './v7.js';

const v7State = {
  // 1. Blur-to-Recall
  blurNoteId: '__sample__',
  blurDifficulty: 'medium',
  blurRevealed: new Set(),
  blurAllRevealed: false,
  // 3. 1v1 Battle
  battleMode: 'setup', // setup | playing | result | incoming
  battleIncoming: null,
  battleQuestions: [],
  battleIdx: 0,
  battleScore: 0,
  battleStartMs: 0,
  battleFinished: null, // { challengerName, score, total, timeSec, url, winnerObj }
  // 4. Sleep Revision
  sleepRunning: false,
  sleepMinutes: 15,
  sleepRemainingSec: 900,
  sleepTimerHandle: null,
  sleepLoopHandle: null,
  sleepNoise: null,
  sleepLines: [],
  sleepIdx: 0,
  // 5. Focus Garden
  gardenRunning: false,
  gardenDurationMin: 25,
  gardenRemainingSec: 1500,
  gardenTimerHandle: null
};

function fmtMMSS(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function initV7Superpowers({ onOpenExamHubTab } = {}) {
  // Check if user opened a 1v1 Battle Link (#battle=...)
  const checkBattleHash = () => {
    const hash = window.location.hash || '';
    if (!hash.startsWith('#battle=')) return;
    const encoded = hash.slice('#battle='.length).trim();
    const decoded = decodeBattlePayload(encoded);
    if (!decoded) return;
    v7State.battleIncoming = decoded;
    v7State.battleMode = 'incoming';
    v7State.battleFinished = null;
    if (typeof onOpenExamHubTab === 'function') {
      onOpenExamHubTab('battle');
    }
  };

  window.addEventListener('hashchange', checkBattleHash);
  checkBattleHash();
}

export async function renderV7Panel(tabName) {
  switch (tabName) {
    case 'blur':
      await renderBlurPanel();
      break;
    case 'radar':
      renderSpeedRadarPanel();
      break;
    case 'battle':
      renderBattlePanel();
      break;
    case 'sleep':
      await renderSleepPanel();
      break;
    case 'garden':
      renderGardenPanel();
      break;
  }
}

// ============================================================================
// 1. BLUR-TO-RECALL CURTAIN
// ============================================================================

async function renderBlurPanel() {
  const container = document.getElementById('v6-panel-blur');
  if (!container) return;

  const notes = await listNotes();
  let sourceTitle = STARTER_PACKS[1].title;
  let sourceText = STARTER_PACKS[1].noteContent;

  if (v7State.blurNoteId !== '__sample__') {
    const match = notes.find((n) => n.id === v7State.blurNoteId);
    if (match) {
      sourceTitle = match.title;
      sourceText = match.content;
    } else if (notes.length) {
      v7State.blurNoteId = notes[0].id;
      sourceTitle = notes[0].title;
      sourceText = notes[0].content;
    }
  } else if (notes.length) {
    v7State.blurNoteId = notes[0].id;
    sourceTitle = notes[0].title;
    sourceText = notes[0].content;
  }

  const { tokens, blurCount } = tokenizeForBlurRecall(sourceText, v7State.blurDifficulty);
  const revealedCount = v7State.blurAllRevealed ? blurCount : v7State.blurRevealed.size;

  const renderedText = tokens
    .map((tok) => {
      if (!tok.blur) return escapeHtml(tok.text);
      const isOpen = v7State.blurAllRevealed || v7State.blurRevealed.has(tok.id);
      return `<button type="button" class="v7-blur-chip ${isOpen ? 'is-revealed' : ''}" data-blur-id="${escapeHtml(tok.id)}">${escapeHtml(tok.text)}</button>`;
    })
    .join('');

  container.innerHTML = `
    <div class="glass-card v6-card">
      <div class="v6-toolbar">
        <div>
          <span class="v6-mini-tag">APPLE GLASS ACTIVE RECALL</span>
          <h3 class="section-heading" style="margin:6px 0 0;">Blur-to-Recall Curtain</h3>
          <p class="item-sub" style="margin:4px 0 0;">Tap any frosted glass word to unblur &amp; test your memory — zero typing required.</p>
        </div>
        <span class="pill">Revealed: ${Math.min(revealedCount, blurCount)} / ${blurCount}</span>
      </div>

      <div class="v6-form-grid" style="margin-bottom:14px;">
        <div class="field-group">
          <label class="field-label" for="v7-blur-note">Select Note</label>
          <select id="v7-blur-note" class="select">
            ${notes.map((n) => `<option value="${escapeHtml(n.id)}" ${n.id === v7State.blurNoteId ? 'selected' : ''}>${escapeHtml(n.title)}</option>`).join('')}
            <option value="__sample__" ${v7State.blurNoteId === '__sample__' ? 'selected' : ''}>Sample: Class 12 Physics Formulas</option>
          </select>
        </div>
        <div class="field-group">
          <label class="field-label" for="v7-blur-diff">Blur Intensity</label>
          <select id="v7-blur-diff" class="select">
            <option value="light" ${v7State.blurDifficulty === 'light' ? 'selected' : ''}>Light (Key Formulas &amp; Long Terms)</option>
            <option value="medium" ${v7State.blurDifficulty === 'medium' ? 'selected' : ''}>Medium (Balanced Active Recall)</option>
            <option value="hard" ${v7State.blurDifficulty === 'hard' ? 'selected' : ''}>Hardcore (Topper Memory Test)</option>
          </select>
        </div>
      </div>

      <div class="btn-row" style="margin-bottom:14px;">
        <button id="v7-blur-toggle-all" class="btn btn-secondary btn-sm" type="button">${v7State.blurAllRevealed ? '🙈 Re-Blur All' : '👁️ Reveal All'}</button>
        <button id="v7-blur-reset" class="btn btn-ghost btn-sm" type="button">🔄 Reset Curtain</button>
      </div>

      <div class="v7-blur-canvas" aria-label="Blur to recall text">${renderedText}</div>
    </div>
  `;

  container.querySelector('#v7-blur-note')?.addEventListener('change', (e) => {
    v7State.blurNoteId = e.target.value;
    v7State.blurRevealed.clear();
    v7State.blurAllRevealed = false;
    renderBlurPanel();
  });

  container.querySelector('#v7-blur-diff')?.addEventListener('change', (e) => {
    v7State.blurDifficulty = e.target.value;
    v7State.blurRevealed.clear();
    v7State.blurAllRevealed = false;
    renderBlurPanel();
  });

  container.querySelector('#v7-blur-toggle-all')?.addEventListener('click', () => {
    v7State.blurAllRevealed = !v7State.blurAllRevealed;
    if (!v7State.blurAllRevealed) v7State.blurRevealed.clear();
    renderBlurPanel();
  });

  container.querySelector('#v7-blur-reset')?.addEventListener('click', () => {
    v7State.blurAllRevealed = false;
    v7State.blurRevealed.clear();
    renderBlurPanel();
  });

  container.querySelectorAll('[data-blur-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.blurId;
      if (v7State.blurRevealed.has(id)) v7State.blurRevealed.delete(id);
      else v7State.blurRevealed.add(id);
      renderBlurPanel();
    });
  });
}

// ============================================================================
// 2. EXAM HALL SPEED RADAR (TIME AUTOPSY)
// ============================================================================

function renderSpeedRadarPanel() {
  const container = document.getElementById('v6-panel-radar');
  if (!container) return;

  const report = loadSpeedRadarReport();

  if (!report) {
    container.innerHTML = `
      <div class="glass-card v6-card">
        <span class="v6-mini-tag">JEE TIME AUTOPSY</span>
        <h3 class="section-heading" style="margin:8px 0 4px;">Exam Hall Speed Radar</h3>
        <p class="item-sub" style="margin:0 0 16px;">Complete any <strong>JEE CBT Test</strong> to see your exact question-by-question speed breakdown across 4 zones: Topper Zone, Time Trap, Silly Guess &amp; Rank Killer.</p>
        <button id="v7-radar-go-cbt" class="btn btn-primary btn-sm" type="button">🖥️ Launch JEE CBT Test Now</button>
      </div>
    `;
    container.querySelector('#v7-radar-go-cbt')?.addEventListener('click', () => {
      document.querySelector('#v6-subnav [data-v6-tab="cbt"]')?.click();
    });
    return;
  }

  const maxSec = Math.max(10, ...report.items.map((x) => x.sec));
  const zoneLabels = {
    topper: { name: 'Topper Zone', color: '#10b981' },
    timeTrap: { name: 'Time Trap', color: '#fbbf24' },
    sillyGuess: { name: 'Silly Guess', color: '#fb923c' },
    rankKiller: { name: 'Rank Killer', color: '#fb7185' },
    skipped: { name: 'Skipped', color: '#94a3b8' }
  };

  container.innerHTML = `
    <div class="glass-card v6-card">
      <div class="v6-toolbar">
        <div>
          <span class="v6-mini-tag">LATEST CBT TIME AUTOPSY</span>
          <h3 class="section-heading" style="margin:6px 0 0;">Exam Hall Speed Radar</h3>
          <p class="item-sub" style="margin:4px 0 0;">Average Pace: <strong>${report.avgSec}s / question</strong> • Fast cutoff: ≤${report.fastThresholdSec}s</p>
        </div>
        <button id="v7-radar-new-cbt" class="btn btn-secondary btn-sm" type="button">Take New CBT</button>
      </div>

      <div class="v7-radar-grid">
        <div class="v7-radar-quad quad-topper">
          <span class="v7-quad-title">🟢 Topper Zone</span>
          <strong>${report.counts.topper}</strong>
          <span>Fast &amp; Correct</span>
        </div>
        <div class="v7-radar-quad quad-trap">
          <span class="v7-quad-title">🟡 Time Trap</span>
          <strong>${report.counts.timeTrap}</strong>
          <span>Slow &amp; Correct</span>
        </div>
        <div class="v7-radar-quad quad-silly">
          <span class="v7-quad-title">🟠 Silly Guess</span>
          <strong>${report.counts.sillyGuess}</strong>
          <span>Fast &amp; Wrong</span>
        </div>
        <div class="v7-radar-quad quad-killer">
          <span class="v7-quad-title">🔴 Rank Killer</span>
          <strong>${report.counts.rankKiller}</strong>
          <span>Slow &amp; Wrong</span>
        </div>
      </div>

      <div class="v6-board-prompt" style="margin-top:14px;">💡 Coach Tip: ${escapeHtml(report.advice)}</div>

      <h4 class="section-heading" style="margin:14px 0 8px;">Question-by-Question Time Bars</h4>
      <div class="v7-time-bars">
        ${report.items
          .map((item) => {
            const z = zoneLabels[item.zone] || zoneLabels.skipped;
            const pct = Math.max(8, Math.round((item.sec / maxSec) * 100));
            return `
            <div class="v7-time-row">
              <span class="v7-time-q">Q${item.index} (${escapeHtml(item.subject)})</span>
              <div class="v7-time-track">
                <div class="v7-time-fill" style="width:${pct}%; background:${z.color};"></div>
              </div>
              <span class="v7-time-sec">${item.sec}s • ${z.name}</span>
            </div>`;
          })
          .join('')}
      </div>
    </div>
  `;

  container.querySelector('#v7-radar-new-cbt')?.addEventListener('click', () => {
    document.querySelector('#v6-subnav [data-v6-tab="cbt"]')?.click();
  });
}

// ============================================================================
// 3. 1v1 WHATSAPP QUIZ BATTLE LINK
// ============================================================================

function downloadBattleStoryCard({ challengerName, challengerScore, challengerTimeSec, friendName, friendScore, friendTimeSec, total, winnerObj }) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const grad = ctx.createLinearGradient(0, 0, 1080, 1080);
  grad.addColorStop(0, '#090d24');
  grad.addColorStop(0.55, '#191445');
  grad.addColorStop(1, '#082c26');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1080, 1080);

  ctx.fillStyle = '#34d399';
  ctx.font = 'bold 34px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('FLIPNOTE • 1v1 QUIZ BATTLE', 540, 120);

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 74px -apple-system, sans-serif';
  ctx.fillText(`🏆 ${winnerObj.winner} Wins!`, 540, 235);

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '32px -apple-system, sans-serif';
  ctx.fillText(winnerObj.margin, 540, 295);

  // Two Player Cards
  const drawCard = (x, name, score, sec, accent) => {
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(x, 380, 420, 420, 32);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 40px -apple-system, sans-serif';
    ctx.fillText(name.slice(0, 14), x + 210, 470);

    ctx.fillStyle = accent;
    ctx.font = 'bold 110px -apple-system, sans-serif';
    ctx.fillText(`${score}/${total}`, x + 210, 620);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '32px -apple-system, sans-serif';
    ctx.fillText(`⏱ ${sec}s`, x + 210, 720);
  };

  drawCard(80, challengerName, challengerScore, challengerTimeSec, '#7c6cf8');
  drawCard(580, friendName, friendScore, friendTimeSec, '#34d399');

  ctx.fillStyle = '#94a3b8';
  ctx.font = '28px -apple-system, sans-serif';
  ctx.fillText('IG: @flipnote.app  •  YT: @flipnoteapp  •  Free Offline Study App', 540, 960);

  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = 'flipnote-1v1-battle-card.png';
  a.click();
}

function renderBattlePanel() {
  const container = document.getElementById('v6-panel-battle');
  if (!container) return;

  // Incoming challenge from #battle= link
  if (v7State.battleMode === 'incoming' && v7State.battleIncoming) {
    const inc = v7State.battleIncoming;
    container.innerHTML = `
      <div class="glass-card v6-card" style="text-align:center;">
        <span class="v6-mini-tag">⚔️ 1v1 CHALLENGE RECEIVED</span>
        <h3 class="section-heading" style="margin:10px 0 6px; font-size:1.4rem;">${escapeHtml(inc.challengerName)} challenged you!</h3>
        <p class="item-sub" style="margin:0 0 16px;">${escapeHtml(inc.title)} • Target to beat: <strong>${inc.challengerScore}/${inc.total}</strong> in <strong>${inc.challengerTimeSec}s</strong></p>
        <div class="field-group" style="max-width:300px; margin:0 auto 14px;">
          <input id="v7-battle-my-name" class="input" type="text" placeholder="Enter your name..." />
        </div>
        <button id="v7-battle-accept" class="btn btn-primary" type="button">🔥 Accept &amp; Play 5 Questions</button>
      </div>
    `;
    container.querySelector('#v7-battle-accept')?.addEventListener('click', () => {
      v7State.battlePlayerName = container.querySelector('#v7-battle-my-name')?.value.trim() || 'You';
      v7State.battleQuestions = inc.questions;
      v7State.battleIdx = 0;
      v7State.battleScore = 0;
      v7State.battleStartMs = Date.now();
      v7State.battleMode = 'playing';
      renderBattlePanel();
    });
    return;
  }

  // Live 5-question Battle Sprint
  if (v7State.battleMode === 'playing') {
    const q = v7State.battleQuestions[v7State.battleIdx];
    container.innerHTML = `
      <div class="glass-card v6-card">
        <div class="v6-toolbar">
          <span class="v6-mini-tag">⚔️ 1v1 BATTLE • Q${v7State.battleIdx + 1} / ${v7State.battleQuestions.length}</span>
          <span class="pill">Score: ${v7State.battleScore}</span>
        </div>
        <h3 class="v6-cbt-qtext">${escapeHtml(q.question)}</h3>
        <div class="v6-cbt-options">
          ${q.options
            .map(
              (opt, idx) => `
            <button class="v6-cbt-opt" data-b-opt="${idx}" type="button">
              <span class="v6-opt-letter">${String.fromCharCode(65 + idx)}</span>
              <span>${escapeHtml(opt)}</span>
            </button>`
            )
            .join('')}
        </div>
      </div>
    `;

    container.querySelectorAll('[data-b-opt]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (Number(btn.dataset.bOpt) === q.correctIndex) v7State.battleScore += 1;
        v7State.battleIdx += 1;
        if (v7State.battleIdx >= v7State.battleQuestions.length) {
          const timeSec = Math.max(1, Math.round((Date.now() - v7State.battleStartMs) / 1000));
          if (v7State.battleIncoming) {
            const inc = v7State.battleIncoming;
            const winnerObj = computeBattleWinner({
              challengerName: inc.challengerName,
              challengerScore: inc.challengerScore,
              challengerTimeSec: inc.challengerTimeSec,
              friendName: v7State.battlePlayerName || 'You',
              friendScore: v7State.battleScore,
              friendTimeSec: timeSec
            });
            v7State.battleFinished = {
              isVsResult: true,
              challengerName: inc.challengerName,
              challengerScore: inc.challengerScore,
              challengerTimeSec: inc.challengerTimeSec,
              friendName: v7State.battlePlayerName || 'You',
              friendScore: v7State.battleScore,
              friendTimeSec: timeSec,
              total: inc.total,
              winnerObj
            };
          } else {
            const encoded = encodeBattlePayload({
              challengerName: v7State.battlePlayerName || 'Student',
              title: 'JEE & Board 5Q Speed Battle',
              score: v7State.battleScore,
              total: v7State.battleQuestions.length,
              timeSec,
              questions: v7State.battleQuestions
            });
            const baseUrl = `${window.location.origin}${window.location.pathname}`;
            v7State.battleFinished = {
              isVsResult: false,
              challengerName: v7State.battlePlayerName || 'Student',
              score: v7State.battleScore,
              total: v7State.battleQuestions.length,
              timeSec,
              url: `${baseUrl}#battle=${encoded}`
            };
          }
          v7State.battleMode = 'result';
        }
        renderBattlePanel();
      });
    });
    return;
  }

  // Result / Share WhatsApp Link
  if (v7State.battleMode === 'result' && v7State.battleFinished) {
    const f = v7State.battleFinished;
    if (f.isVsResult) {
      container.innerHTML = `
        <div class="glass-card v6-card" style="text-align:center;">
          <span class="v6-mini-tag">🏆 1v1 BATTLE RESULT</span>
          <h3 class="section-heading" style="margin:10px 0 4px; font-size:1.55rem;">${escapeHtml(f.winnerObj.winner)} Wins!</h3>
          <p class="item-sub" style="margin:0 0 16px;">${escapeHtml(f.winnerObj.margin)}</p>
          <div class="v7-vs-grid">
            <div class="v6-stat-chip"><strong>${f.challengerScore}/${f.total}</strong><span>${escapeHtml(f.challengerName)} (${f.challengerTimeSec}s)</span></div>
            <div class="v6-stat-chip"><strong>${f.friendScore}/${f.total}</strong><span>${escapeHtml(f.friendName)} (${f.friendTimeSec}s)</span></div>
          </div>
          <div class="btn-row" style="justify-content:center; margin-top:16px;">
            <button id="v7-battle-dl-card" class="btn btn-primary btn-sm" type="button">📸 Download Story Card (PNG)</button>
            <button id="v7-battle-restart" class="btn btn-secondary btn-sm" type="button">Create New Challenge</button>
          </div>
        </div>
      `;
      container.querySelector('#v7-battle-dl-card')?.addEventListener('click', () => downloadBattleStoryCard(f));
      container.querySelector('#v7-battle-restart')?.addEventListener('click', () => {
        v7State.battleIncoming = null;
        v7State.battleFinished = null;
        v7State.battleMode = 'setup';
        history.replaceState(null, '', window.location.pathname);
        renderBattlePanel();
      });
      return;
    }

    const waText = encodeURIComponent(
      `🔥 I scored ${f.score}/${f.total} in ${f.timeSec}s on FLIPNOTE 1v1 Quiz Battle! Beat my score here: ${f.url}`
    );

    container.innerHTML = `
      <div class="glass-card v6-card">
        <span class="v6-mini-tag">⚔️ CHALLENGE LINK READY</span>
        <h3 class="section-heading" style="margin:8px 0 4px;">You scored ${f.score}/${f.total} in ${f.timeSec}s!</h3>
        <p class="item-sub" style="margin:0 0 14px;">Send this zero-server link to your friend on WhatsApp — they get the exact same 5 questions to beat you.</p>
        <input id="v7-battle-url" class="input" type="text" readonly value="${escapeHtml(f.url)}" style="margin-bottom:12px;" />
        <div class="btn-row">
          <a class="btn btn-primary btn-sm" href="https://wa.me/?text=${waText}" target="_blank" rel="noopener">💬 Share on WhatsApp</a>
          <button id="v7-battle-copy" class="btn btn-secondary btn-sm" type="button">📋 Copy Link</button>
          <button id="v7-battle-again" class="btn btn-ghost btn-sm" type="button">Play Again</button>
        </div>
      </div>
    `;

    container.querySelector('#v7-battle-copy')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(f.url);
        showToast('1v1 Battle Link copied!');
      } catch {
        showToast('Select and copy the link above.');
      }
    });
    container.querySelector('#v7-battle-again')?.addEventListener('click', () => {
      v7State.battleMode = 'setup';
      v7State.battleFinished = null;
      renderBattlePanel();
    });
    return;
  }

  // Default Setup
  container.innerHTML = `
    <div class="glass-card v6-card">
      <span class="v6-mini-tag">ZERO-SERVER MULTIPLAYER</span>
      <h3 class="section-heading" style="margin:8px 0 4px;">1v1 WhatsApp Quiz Battle Link</h3>
      <p class="item-sub" style="margin:0 0 16px;">Play a fast 5-question JEE/Board sprint, lock your score &amp; time into a link, and challenge your friends on WhatsApp.</p>
      <div class="field-group" style="max-width:320px; margin-bottom:14px;">
        <label class="field-label" for="v7-battle-name">Your Name</label>
        <input id="v7-battle-name" class="input" type="text" placeholder="e.g. Aditya" />
      </div>
      <button id="v7-battle-start" class="btn btn-primary" type="button">⚔️ Start 5-Question Battle Sprint</button>
    </div>
  `;

  container.querySelector('#v7-battle-start')?.addEventListener('click', () => {
    v7State.battlePlayerName = container.querySelector('#v7-battle-name')?.value.trim() || 'Student';
    v7State.battleIncoming = null;
    v7State.battleQuestions = [...BUILTIN_CBT_BANK].sort(() => Math.random() - 0.5).slice(0, 5);
    v7State.battleIdx = 0;
    v7State.battleScore = 0;
    v7State.battleStartMs = Date.now();
    v7State.battleMode = 'playing';
    renderBattlePanel();
  });
}

// ============================================================================
// 4. SLEEP REVISION MODE (AUTO FADE-OUT SUBCONSCIOUS AUDIO LOOP)
// ============================================================================

function stopSleepRevision() {
  v7State.sleepRunning = false;
  if (v7State.sleepTimerHandle) {
    clearInterval(v7State.sleepTimerHandle);
    v7State.sleepTimerHandle = null;
  }
  if (v7State.sleepLoopHandle) {
    clearTimeout(v7State.sleepLoopHandle);
    v7State.sleepLoopHandle = null;
  }
  v7State.sleepNoise?.stop();
  v7State.sleepNoise = null;
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

function speakNextSleepLine() {
  if (!v7State.sleepRunning || !v7State.sleepLines.length) return;
  const line = v7State.sleepLines[v7State.sleepIdx % v7State.sleepLines.length];
  v7State.sleepIdx += 1;

  const liveEl = document.getElementById('v7-sleep-now');
  if (liveEl) liveEl.textContent = line;

  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(line);
    u.rate = 0.78;
    u.pitch = 0.92;
    u.volume = v7State.sleepRemainingSec <= 12 ? 0.35 : 0.75;
    u.onend = () => {
      if (v7State.sleepRunning) {
        v7State.sleepLoopHandle = setTimeout(speakNextSleepLine, 2200);
      }
    };
    window.speechSynthesis.speak(u);
  } else {
    v7State.sleepLoopHandle = setTimeout(speakNextSleepLine, 4500);
  }
}

async function renderSleepPanel() {
  const container = document.getElementById('v6-panel-sleep');
  if (!container) return;

  const [notes, sets] = await Promise.all([listNotes(), listStudySets()]);
  const formulas = extractFormulasFromNotes(notes);
  const lines = [];
  for (const f of formulas) lines.push(`${f.label}. ${f.expression}`);
  for (const s of sets) {
    for (const c of s.cards || []) lines.push(`${c.front}. ${c.back}`);
  }
  if (!lines.length) {
    for (const p of STARTER_PACKS.slice(0, 2)) {
      for (const c of p.flashcards) lines.push(`${c.front}. ${c.back}`);
    }
  }
  v7State.sleepLines = lines;

  container.innerHTML = `
    <div class="glass-card v6-card v7-sleep-card">
      <span class="v6-mini-tag">🌙 SUBCONSCIOUS NIGHT LOOP</span>
      <h3 class="section-heading" style="margin:8px 0 4px;">Sleep Revision Mode</h3>
      <p class="item-sub" style="margin:0 0 16px;">Soft brown rain soundscape + slow calm voice repeating your formulas &amp; flashcards (${lines.length} items ready) with automatic fade-out.</p>

      <div class="v6-pill-row">
        ${[15, 30, 45]
          .map(
            (m) =>
              `<button class="v6-filter-pill ${v7State.sleepMinutes === m ? 'active' : ''}" data-sleep-min="${m}" type="button" ${v7State.sleepRunning ? 'disabled' : ''}>${m} min</button>`
          )
          .join('')}
      </div>

      <div class="v7-sleep-stage">
        <div id="v7-sleep-clock" class="v7-sleep-clock">${fmtMMSS(v7State.sleepRunning ? v7State.sleepRemainingSec : v7State.sleepMinutes * 60)}</div>
        <p id="v7-sleep-now" class="item-sub" style="margin:8px 0 0;">${v7State.sleepRunning ? 'Playing soft revision loop...' : 'Put on earbuds & tap Start Sleep Loop'}</p>
      </div>

      <div class="btn-row" style="justify-content:center; margin-top:14px;">
        ${
          v7State.sleepRunning
            ? `<button id="v7-sleep-stop" class="btn btn-danger" type="button">⏹ Stop Sleep Loop</button>`
            : `<button id="v7-sleep-start" class="btn btn-primary" type="button">🌙 Start Sleep Revision</button>`
        }
      </div>
    </div>
  `;

  container.querySelectorAll('[data-sleep-min]').forEach((btn) => {
    btn.addEventListener('click', () => {
      v7State.sleepMinutes = Number(btn.dataset.sleepMin);
      v7State.sleepRemainingSec = v7State.sleepMinutes * 60;
      renderSleepPanel();
    });
  });

  container.querySelector('#v7-sleep-start')?.addEventListener('click', () => {
    stopSleepRevision();
    v7State.sleepRunning = true;
    v7State.sleepRemainingSec = v7State.sleepMinutes * 60;
    v7State.sleepNoise = createSleepNoiseEngine();
    v7State.sleepNoise.start(0.12);
    speakNextSleepLine();

    v7State.sleepTimerHandle = setInterval(() => {
      v7State.sleepRemainingSec = Math.max(0, v7State.sleepRemainingSec - 1);
      const clock = document.getElementById('v7-sleep-clock');
      if (clock) clock.textContent = fmtMMSS(v7State.sleepRemainingSec);
      if (v7State.sleepRemainingSec === 10) {
        v7State.sleepNoise?.fadeOut(9);
      }
      if (v7State.sleepRemainingSec === 0) {
        stopSleepRevision();
        renderSleepPanel();
        showToast('Sleep Revision faded out smoothly. Good night!');
      }
    }, 1000);

    renderSleepPanel();
  });

  container.querySelector('#v7-sleep-stop')?.addEventListener('click', () => {
    stopSleepRevision();
    renderSleepPanel();
  });
}

// ============================================================================
// 5. FOCUS GARDEN (POMODORO CRYSTAL PLANT WORLD)
// ============================================================================

function renderPlantSvg(stage, color = '#34d399') {
  return `
  <svg viewBox="0 0 120 120" width="112" height="112" aria-hidden="true">
    <ellipse cx="60" cy="104" rx="34" ry="8" fill="rgba(148,163,184,0.22)" />
    <path d="M40 94 L80 94 L74 108 L46 108 Z" fill="rgba(255,255,255,0.16)" stroke="${color}" stroke-width="2" />
    ${stage >= 1 ? `<circle cx="60" cy="88" r="6" fill="${color}" />` : ''}
    ${stage >= 2 ? `<path d="M60 88 Q60 68 60 56" stroke="${color}" stroke-width="4" stroke-linecap="round" fill="none" /><path d="M60 72 Q44 64 46 52 Q58 56 60 72 Z" fill="${color}" opacity="0.85" />` : ''}
    ${stage >= 3 ? `<path d="M60 66 Q76 58 74 44 Q62 50 60 66 Z" fill="${color}" opacity="0.92" />` : ''}
    ${stage >= 4 ? `<polygon points="60,22 72,40 60,56 48,40" fill="${color}" /><circle cx="60" cy="39" r="18" fill="${color}" opacity="0.18" />` : ''}
  </svg>`;
}

function stopGardenTimer() {
  if (v7State.gardenTimerHandle) {
    clearInterval(v7State.gardenTimerHandle);
    v7State.gardenTimerHandle = null;
  }
}

function renderGardenPanel() {
  const container = document.getElementById('v6-panel-garden');
  if (!container) return;

  const garden = loadFocusGarden();
  const totalSec = v7State.gardenDurationMin * 60;
  const progress = v7State.gardenRunning ? 1 - v7State.gardenRemainingSec / totalSec : 0;
  const stageInfo = getPlantGrowthStage(progress);

  container.innerHTML = `
    <div class="glass-card v6-card">
      <div class="v6-toolbar">
        <div>
          <span class="v6-mini-tag">POMODORO STREAK WORLD</span>
          <h3 class="section-heading" style="margin:6px 0 0;">Focus Garden</h3>
          <p class="item-sub" style="margin:4px 0 0;">Finish a session to bloom a glowing crystal plant. Quit early and it wilts!</p>
        </div>
        <div class="pill">🌿 ${garden.plants.filter((p) => p.status === 'bloomed').length} Bloomed • ${garden.totalMinutes} min</div>
      </div>

      <div class="v6-pill-row">
        ${[5, 15, 25, 50]
          .map(
            (m) =>
              `<button class="v6-filter-pill ${v7State.gardenDurationMin === m ? 'active' : ''}" data-g-min="${m}" type="button" ${v7State.gardenRunning ? 'disabled' : ''}>${m} min</button>`
          )
          .join('')}
      </div>

      <div class="v7-garden-stage">
        <div id="v7-garden-svg">${renderPlantSvg(v7State.gardenRunning ? stageInfo.stage : 4, '#34d399')}</div>
        <div id="v7-garden-clock" class="v7-sleep-clock">${fmtMMSS(v7State.gardenRunning ? v7State.gardenRemainingSec : v7State.gardenDurationMin * 60)}</div>
        <p id="v7-garden-stage-label" class="item-sub" style="margin:6px 0 0;">${v7State.gardenRunning ? stageInfo.label : 'Ready to plant a new crystal'}</p>
        <div class="btn-row" style="justify-content:center; margin-top:14px;">
          ${
            v7State.gardenRunning
              ? `<button id="v7-garden-giveup" class="btn btn-danger btn-sm" type="button">🥀 Give Up (Wilts Plant)</button>`
              : `<button id="v7-garden-start" class="btn btn-primary" type="button">🌱 Plant &amp; Start Focus</button>`
          }
        </div>
      </div>

      ${
        garden.plants.length
          ? `<h4 class="section-heading" style="margin:18px 0 8px;">Your Focus Garden (${garden.plants.length})</h4>
            <div class="v7-garden-grid">
              ${garden.plants
                .slice(0, 12)
                .map(
                  (p) => `
                <div class="v7-plant-tile ${p.status === 'wilted' ? 'is-wilted' : ''}">
                  <span style="font-size:1.35rem;">${p.status === 'bloomed' ? '💎' : '🥀'}</span>
                  <strong style="font-size:0.82rem;">${escapeHtml(p.speciesName)}</strong>
                  <span class="item-sub" style="font-size:0.74rem;">${p.minutes}m • ${p.status}</span>
                </div>`
                )
                .join('')}
            </div>`
          : ''
      }
    </div>
  `;

  container.querySelectorAll('[data-g-min]').forEach((btn) => {
    btn.addEventListener('click', () => {
      v7State.gardenDurationMin = Number(btn.dataset.gMin);
      v7State.gardenRemainingSec = v7State.gardenDurationMin * 60;
      renderGardenPanel();
    });
  });

  container.querySelector('#v7-garden-start')?.addEventListener('click', () => {
    stopGardenTimer();
    v7State.gardenRunning = true;
    v7State.gardenRemainingSec = v7State.gardenDurationMin * 60;

    v7State.gardenTimerHandle = setInterval(() => {
      v7State.gardenRemainingSec = Math.max(0, v7State.gardenRemainingSec - 1);
      const clock = document.getElementById('v7-garden-clock');
      const lbl = document.getElementById('v7-garden-stage-label');
      const svgBox = document.getElementById('v7-garden-svg');
      const frac = 1 - v7State.gardenRemainingSec / (v7State.gardenDurationMin * 60);
      const st = getPlantGrowthStage(frac);
      if (clock) clock.textContent = fmtMMSS(v7State.gardenRemainingSec);
      if (lbl) lbl.textContent = st.label;
      if (svgBox) svgBox.innerHTML = renderPlantSvg(st.stage, '#34d399');

      if (v7State.gardenRemainingSec === 0) {
        stopGardenTimer();
        v7State.gardenRunning = false;
        recordGardenPlant({ minutes: v7State.gardenDurationMin, status: 'bloomed' });
        showToast(`✨ Crystal plant bloomed! +${v7State.gardenDurationMin} focus mins.`);
        renderGardenPanel();
      }
    }, 1000);

    renderGardenPanel();
  });

  container.querySelector('#v7-garden-giveup')?.addEventListener('click', () => {
    stopGardenTimer();
    v7State.gardenRunning = false;
    recordGardenPlant({ minutes: v7State.gardenDurationMin, status: 'wilted' });
    showToast('🥀 Session abandoned — your plant wilted.');
    renderGardenPanel();
  });
}
