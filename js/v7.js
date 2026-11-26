// FLIPNOTE v7.0 — 5 Unique Offline Superpowers
// 1. Blur-to-Recall Curtain (Apple Glass Blur Active Recall)
// 2. Exam Hall Speed Radar (Question-by-Question Time Autopsy)
// 3. 1v1 WhatsApp Quiz Battle Link (Zero-Server Encoded Challenge + Story Card)
// 4. Sleep Revision Mode (Slow Voice + Ambient Brown/Rain Noise + Auto Fade-Out)
// 5. Focus Garden (Pomodoro Crystal Plant World)

import { uid } from './utils.js';

function safeGet(key, fallback) {
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function safeSet(key, val) {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(key, JSON.stringify(val));
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// 1. BLUR-TO-RECALL CURTAIN (APPLE GLASS BLUR TOKENIZER)
// ============================================================================

const BLUR_STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'about', 'have', 'has', 'had',
  'are', 'was', 'were', 'been', 'being', 'will', 'shall', 'would', 'could', 'should', 'their',
  'there', 'where', 'when', 'which', 'what', 'while', 'also', 'only', 'then', 'than', 'because',
  'called', 'known', 'given', 'used', 'between', 'through', 'during', 'across', 'under', 'over'
]);

export function tokenizeForBlurRecall(text = '', difficulty = 'medium') {
  const threshold = difficulty === 'hard' ? 4 : difficulty === 'light' ? 7 : 5;
  const parts = String(text || '').split(/(\s+)/);
  const tokens = [];
  let blurCount = 0;

  for (let i = 0; i < parts.length; i++) {
    const raw = parts[i];
    if (!raw) continue;
    if (/^\s+$/.test(raw)) {
      tokens.push({ id: `t_${i}`, text: raw, blur: false });
      continue;
    }

    const clean = raw.replace(/^[^A-Za-z0-9α-ωΑ-ΩΔλμνρστωπεηθ]+|[^A-Za-z0-9α-ωΑ-ΩΔλμνρστωπεηθ²³]+$/g, '');
    const low = clean.toLowerCase();
    const hasMathOrNum = /[0-9=∝→⇌²³^√∫∑α-ωΑ-ΩΔλφε]/.test(raw);
    const isLongKeyTerm = clean.length >= threshold && !BLUR_STOP_WORDS.has(low);
    const isAllCaps = clean.length >= 2 && clean === clean.toUpperCase() && /[A-Z]/.test(clean);

    const shouldBlur = hasMathOrNum || isLongKeyTerm || isAllCaps;
    if (shouldBlur) blurCount += 1;
    tokens.push({ id: `t_${i}`, text: raw, blur: shouldBlur });
  }

  return { tokens, blurCount };
}

// ============================================================================
// 2. EXAM HALL SPEED RADAR (QUESTION-BY-QUESTION TIME AUTOPSY)
// ============================================================================

export const SPEED_RADAR_KEY = 'flipnote_speed_radar_v7';

export function buildSpeedRadarReport(questions = [], responses = {}, timingsSec = {}, fastThresholdSec = 45) {
  const buckets = {
    topper: [],     // Fast & Correct
    timeTrap: [],   // Slow & Correct
    sillyGuess: [], // Fast & Wrong
    rankKiller: [], // Slow & Wrong
    skipped: []
  };

  let totalTimeSec = 0;
  const items = [];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const r = responses[q.id];
    const sec = Math.max(1, Math.round(timingsSec[q.id] || 0));
    totalTimeSec += sec;

    const selected = r && typeof r.selectedIndex === 'number' ? r.selectedIndex : null;
    const isFast = sec <= fastThresholdSec;
    let zone = 'skipped';

    if (selected === null) {
      zone = 'skipped';
      buckets.skipped.push({ index: i + 1, question: q.question, subject: q.subject || 'General', sec });
    } else if (selected === q.correctIndex) {
      zone = isFast ? 'topper' : 'timeTrap';
      buckets[zone].push({ index: i + 1, question: q.question, subject: q.subject || 'General', sec });
    } else {
      zone = isFast ? 'sillyGuess' : 'rankKiller';
      buckets[zone].push({ index: i + 1, question: q.question, subject: q.subject || 'General', sec });
    }

    items.push({ index: i + 1, question: q.question, subject: q.subject || 'General', sec, zone });
  }

  const avgSec = questions.length ? Math.round(totalTimeSec / questions.length) : 0;
  let advice = 'Balanced pace! Keep drilling weak concepts.';
  if (buckets.rankKiller.length >= 2) {
    advice = 'Watch out for Rank Killers — skip stuck questions after 60s instead of losing both time and -1 mark.';
  } else if (buckets.sillyGuess.length >= 2) {
    advice = 'Slow down by 10s on quick guesses — your Silly Guess count is costing easy marks.';
  } else if (buckets.timeTrap.length >= 2) {
    advice = 'High accuracy, but practice Formula Blank Recall to turn Time Traps into Topper Zone speed.';
  } else if (buckets.topper.length >= Math.ceil(questions.length * 0.6)) {
    advice = 'Elite JEE exam-hall speed & accuracy! You are operating in the Topper Zone.';
  }

  const report = {
    createdAt: Date.now(),
    totalQuestions: questions.length,
    totalTimeSec,
    avgSec,
    fastThresholdSec,
    counts: {
      topper: buckets.topper.length,
      timeTrap: buckets.timeTrap.length,
      sillyGuess: buckets.sillyGuess.length,
      rankKiller: buckets.rankKiller.length,
      skipped: buckets.skipped.length
    },
    buckets,
    items,
    advice
  };

  return report;
}

export function saveSpeedRadarReport(report) {
  safeSet(SPEED_RADAR_KEY, report);
}

export function loadSpeedRadarReport() {
  return safeGet(SPEED_RADAR_KEY, null);
}

// ============================================================================
// 3. 1v1 WHATSAPP QUIZ BATTLE LINK (ZERO-SERVER ENCODED CHALLENGE)
// ============================================================================

function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(bytes).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64url) {
  const pad = b64url.length % 4 === 0 ? '' : '='.repeat(4 - (b64url.length % 4));
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + pad;
  let bytes;
  if (typeof atob === 'function') {
    const bin = atob(b64);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } else {
    bytes = new Uint8Array(Buffer.from(b64, 'base64'));
  }
  return new TextDecoder().decode(bytes);
}

export function encodeBattlePayload({ challengerName, title, score, total, timeSec, questions }) {
  // Keep URL compact: max 5 questions, concise fields
  const compact = {
    v: 1,
    c: String(challengerName || 'Student').slice(0, 28),
    t: String(title || 'FLIPNOTE 1v1 Battle').slice(0, 48),
    s: Number(score) || 0,
    n: Number(total) || 0,
    tm: Math.max(1, Math.round(Number(timeSec) || 1)),
    q: (questions || []).slice(0, 5).map((item) => ({
      q: String(item.question || '').slice(0, 140),
      o: (item.options || []).slice(0, 4).map((x) => String(x).slice(0, 64)),
      a: typeof item.correctIndex === 'number' ? item.correctIndex : 0
    }))
  };
  return toBase64Url(JSON.stringify(compact));
}

export function decodeBattlePayload(encoded) {
  if (!encoded) return null;
  try {
    const parsed = JSON.parse(fromBase64Url(encoded));
    if (!parsed || !Array.isArray(parsed.q) || !parsed.q.length) return null;
    return {
      challengerName: parsed.c || 'Friend',
      title: parsed.t || 'FLIPNOTE 1v1 Battle',
      challengerScore: Number(parsed.s) || 0,
      total: Number(parsed.n) || parsed.q.length,
      challengerTimeSec: Number(parsed.tm) || 30,
      questions: parsed.q.map((item, idx) => ({
        id: `bq_${idx}`,
        question: item.q,
        options: item.o,
        correctIndex: item.a
      }))
    };
  } catch {
    return null;
  }
}

export function computeBattleWinner({ challengerName, challengerScore, challengerTimeSec, friendName, friendScore, friendTimeSec }) {
  if (friendScore > challengerScore) return { winner: friendName || 'You', outcome: 'friend', margin: `${friendScore - challengerScore} more correct` };
  if (challengerScore > friendScore) return { winner: challengerName || 'Challenger', outcome: 'challenger', margin: `${challengerScore - friendScore} more correct` };
  if (friendTimeSec < challengerTimeSec) return { winner: friendName || 'You', outcome: 'friend', margin: `Faster by ${challengerTimeSec - friendTimeSec}s` };
  if (challengerTimeSec < friendTimeSec) return { winner: challengerName || 'Challenger', outcome: 'challenger', margin: `Faster by ${friendTimeSec - challengerTimeSec}s` };
  return { winner: 'Tie!', outcome: 'tie', margin: 'Exact same score & speed' };
}

// ============================================================================
// 4. SLEEP REVISION MODE (AMBIENT BROWN/RAIN NOISE ENGINE)
// ============================================================================

export function createSleepNoiseEngine() {
  let ctx = null;
  let gainNode = null;
  let sourceNode = null;

  return {
    start(volume = 0.14) {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return false;
        ctx = new AudioCtx();
        const bufferSize = ctx.sampleRate * 3;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        // Smooth brown-noise rain soundscape
        let lastOut = 0.0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          data[i] = (lastOut + 0.02 * white) / 1.02;
          lastOut = data[i];
          data[i] *= 2.8;
        }
        sourceNode = ctx.createBufferSource();
        sourceNode.buffer = buffer;
        sourceNode.loop = true;

        gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(volume, ctx.currentTime);

        sourceNode.connect(gainNode);
        gainNode.connect(ctx.destination);
        sourceNode.start();
        return true;
      } catch {
        return false;
      }
    },
    fadeOut(durationSec = 8) {
      if (ctx && gainNode) {
        try {
          gainNode.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + durationSec);
        } catch {
          // ignore
        }
      }
    },
    stop() {
      try {
        sourceNode?.stop();
        ctx?.close();
      } catch {
        // ignore
      }
      sourceNode = null;
      gainNode = null;
      ctx = null;
    }
  };
}

// ============================================================================
// 5. FOCUS GARDEN (POMODORO CRYSTAL PLANT WORLD)
// ============================================================================

export const FOCUS_GARDEN_KEY = 'flipnote_focus_garden_v7';

export const GARDEN_SPECIES = [
  { id: 'emerald-lotus', name: 'Emerald Lotus', color: '#34d399', accent: '#10b981' },
  { id: 'violet-crystal', name: 'Violet Crystal', color: '#a78bfa', accent: '#7c6cf8' },
  { id: 'amber-sunburst', name: 'Amber Sunburst', color: '#fbbf24', accent: '#f59e0b' },
  { id: 'cyan-aurora', name: 'Cyan Aurora Fern', color: '#38bdf8', accent: '#0284c7' }
];

export function loadFocusGarden() {
  const data = safeGet(FOCUS_GARDEN_KEY, null);
  if (data && Array.isArray(data.plants)) return data;
  return { totalMinutes: 0, streakSessions: 0, plants: [] };
}

export function recordGardenPlant({ minutes = 25, status = 'bloomed', label = 'Deep Study' } = {}) {
  const garden = loadFocusGarden();
  const species = GARDEN_SPECIES[garden.plants.length % GARDEN_SPECIES.length];
  const entry = {
    id: uid(),
    speciesId: species.id,
    speciesName: species.name,
    color: status === 'bloomed' ? species.color : '#94a3b8',
    minutes,
    status, // 'bloomed' | 'wilted'
    label,
    createdAt: Date.now()
  };
  garden.plants.unshift(entry);
  if (status === 'bloomed') {
    garden.totalMinutes = (garden.totalMinutes || 0) + minutes;
    garden.streakSessions = (garden.streakSessions || 0) + 1;
  } else {
    garden.streakSessions = 0;
  }
  safeSet(FOCUS_GARDEN_KEY, garden);
  return garden;
}

export function getPlantGrowthStage(progressFraction = 0) {
  if (progressFraction >= 0.99) return { stage: 4, label: 'Radiant Full Bloom ✨' };
  if (progressFraction >= 0.66) return { stage: 3, label: 'Budding Crystal 🌿' };
  if (progressFraction >= 0.33) return { stage: 2, label: 'Growing Sprout 🌱' };
  return { stage: 1, label: 'Planted Seed 🌰' };
}
