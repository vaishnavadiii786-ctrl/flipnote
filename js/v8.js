// FLIPNOTE v8.0 — AI & Second-Brain Universe Engines (100% Free & Offline-First)
// 1. AI Smart Summary       2. AI Study Tutor          3. Study Streak (Heatmap + Freeze)
// 4. Global Leaderboard     5. Community Notes Library 6. FLIPNOTE Brain (Second-Brain Search)
// 7. Lectures to Notes      8. Solve with Steps        9. Study Planner
// 10. Visual Learning Mode  11. Privacy Vault (PIN)    12. Memory Palace (Loci Method)
// 13. Knowledge Universe (Interactive Constellation Graph)

import { uid } from './utils.js';
import { extractFormulasFromNotes, STARTER_PACKS } from './v6.js';

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

const STOP_WORDS = new Set([
  'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'a', 'an', 'and', 'or', 'of', 'to',
  'in', 'for', 'with', 'by', 'from', 'as', 'that', 'this', 'it', 'on', 'at', 'which', 'have',
  'has', 'had', 'do', 'does', 'did', 'but', 'not', 'can', 'will', 'into', 'about', 'what', 'how',
  'why', 'when', 'where', 'who', 'explain', 'tell', 'give', 'please', 'help'
]);

function extractTerms(text) {
  const words = String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  return [...new Set(words)];
}

// ============================================================================
// 1. AI SMART SUMMARY (MULTI-MODE EXTRACTIVE + OPTIONAL BYOK AI)
// ============================================================================

export function generateSmartSummary(text = '', mode = 'bullets') {
  const clean = String(text || '').trim();
  if (!clean) {
    return { mode, headline: 'Empty Note', points: [], keyTerms: [], wordCount: 0 };
  }

  const lines = clean
    .split(/\r?\n+/)
    .map((l) => l.replace(/^[-*•#\d.)]+\s*/, '').trim())
    .filter((l) => l.length >= 12);

  const sentences = lines.length >= 3
    ? lines
    : clean
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 12);

  const scored = sentences.map((s, idx) => {
    let score = 0;
    if (idx === 0) score += 2;
    if (s.includes(':') || s.includes('=') || s.includes('→')) score += 4;
    if (/\b(law|formula|principle|reaction|theorem|important|energy|current|force|process)\b/i.test(s)) score += 3;
    if (s.length >= 25 && s.length <= 180) score += 2;
    return { s, score, idx };
  });

  const topCount = mode === 'tldr' ? 2 : mode === 'cheat' ? 8 : 5;
  const picked = scored
    .sort((a, b) => b.score - a.score || a.idx - b.idx)
    .slice(0, topCount)
    .sort((a, b) => a.idx - b.idx)
    .map((x) => x.s);

  const keyTerms = extractTerms(clean).slice(0, 10);
  const headlines = {
    bullets: 'Smart Bullet Summary',
    tldr: '30-Second TL;DR',
    cheat: 'Exam Cheat Sheet Highlights',
    definitions: 'Extracted Definitions & Laws'
  };

  let points = picked;
  if (mode === 'definitions') {
    const defs = sentences.filter((s) => s.includes(':') || /\b(is|are|means|states|defined as)\b/i.test(s));
    points = (defs.length ? defs : picked).slice(0, 8);
  }

  return {
    mode,
    headline: headlines[mode] || 'Smart Summary',
    points,
    keyTerms,
    wordCount: clean.split(/\s+/).length
  };
}

// ============================================================================
// 2. AI STUDY TUTOR (NOTE-GROUNDED OFFLINE TUTOR)
// ============================================================================

export function answerTutorQuestion(question = '', notes = []) {
  const q = String(question || '').trim();
  if (!q) {
    return {
      reply: 'Ask me any concept, formula, or revision question from your notes!',
      matchedSource: null,
      followUp: 'Try asking: "Explain Ohm\'s Law" or "Quiz me on Physics formulas".'
    };
  }

  const qTerms = extractTerms(q);
  const allNotes = notes && notes.length
    ? notes
    : STARTER_PACKS.map((p) => ({ id: p.id, title: p.title, subject: p.subject, content: p.noteContent }));

  // Score every line across all notes
  let bestLine = null;
  let bestNote = null;
  let bestScore = 0;

  for (const n of allNotes) {
    const lines = String(n.content || '').split(/\r?\n+/).filter((l) => l.trim().length >= 8);
    for (const line of lines) {
      const lTerms = new Set(extractTerms(`${n.title} ${line}`));
      let hits = 0;
      for (const t of qTerms) {
        if (lTerms.has(t) || [...lTerms].some((lt) => lt.startsWith(t.slice(0, 4)) && t.length >= 4)) {
          hits += 1;
        }
      }
      if (hits > bestScore) {
        bestScore = hits;
        bestLine = line.trim();
        bestNote = n;
      }
    }
  }

  if (bestLine && bestScore > 0) {
    return {
      reply: `From your note "${bestNote.title}":\n\n• ${bestLine}\n\n💡 Memory Tip: Break this into cause → formula/rule → application, and test yourself once without looking!`,
      matchedSource: bestNote.title,
      followUp: `Want to lock this in? Try explaining "${bestLine.split(':')[0].slice(0, 40)}" in your own words.`
    };
  }

  return {
    reply: `I couldn't find an exact match for "${q}" inside your saved notes yet. Add a note on this topic (or import a Free Starter Pack) and I'll break it down, quiz you, and build formulas from it!`,
    matchedSource: null,
    followUp: 'Tip: Enable optional BYOK AI in Settings for open-ended web-scale explanations.'
  };
}

// ============================================================================
// 3. STUDY STREAK (30-DAY HEATMAP + XP + STREAK FREEZE)
// ============================================================================

export const STREAK_STORAGE_KEY = 'flipnote_streak_v8';

function isoDay(ts = Date.now()) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function loadStreakData() {
  const saved = safeGet(STREAK_STORAGE_KEY, null);
  if (saved && typeof saved === 'object' && saved.days) return saved;
  const fresh = {
    xp: 120,
    freezesLeft: 2,
    longestStreak: 1,
    days: { [isoDay()]: 1 }
  };
  safeSet(STREAK_STORAGE_KEY, fresh);
  return fresh;
}

export function recordDailyStudyActivity(xpGain = 25, nowMs = Date.now()) {
  const data = loadStreakData();
  const today = isoDay(nowMs);
  data.days[today] = (data.days[today] || 0) + 1;
  data.xp = (data.xp || 0) + xpGain;
  const stats = computeStreakMetrics(data, nowMs);
  data.longestStreak = Math.max(data.longestStreak || 0, stats.currentStreak);
  safeSet(STREAK_STORAGE_KEY, data);
  return { data, stats };
}

export function useStreakFreeze(nowMs = Date.now()) {
  const data = loadStreakData();
  if ((data.freezesLeft || 0) <= 0) return { ok: false, data };
  const yesterday = isoDay(nowMs - 86400000);
  data.days[yesterday] = Math.max(1, data.days[yesterday] || 0);
  data.freezesLeft -= 1;
  safeSet(STREAK_STORAGE_KEY, data);
  return { ok: true, data };
}

export function computeStreakMetrics(data, nowMs = Date.now()) {
  const days = data?.days || {};
  let currentStreak = 0;
  for (let i = 0; i < 365; i++) {
    const key = isoDay(nowMs - i * 86400000);
    if ((days[key] || 0) > 0) currentStreak += 1;
    else if (i === 0) continue; // grace for today not yet logged
    else break;
  }

  const heatmap = [];
  for (let i = 29; i >= 0; i--) {
    const key = isoDay(nowMs - i * 86400000);
    heatmap.push({ date: key, count: days[key] || 0 });
  }

  return {
    currentStreak,
    longestStreak: Math.max(data?.longestStreak || 0, currentStreak),
    xp: data?.xp || 0,
    freezesLeft: data?.freezesLeft ?? 2,
    heatmap
  };
}

// ============================================================================
// 4. GLOBAL LEADERBOARD (LEAGUE TIERS + USER RANK)
// ============================================================================

const GLOBAL_BENCHMARKS = [
  { name: 'Aarav Sharma', exam: 'JEE Main', xp: 4850, streak: 42 },
  { name: 'Diya Patel', exam: 'Class 12 Boards', xp: 4120, streak: 36 },
  { name: 'Rohan Verma', exam: 'JEE Main', xp: 3490, streak: 29 },
  { name: 'Ananya Iyer', exam: 'Class 10 Boards', xp: 2840, streak: 24 },
  { name: 'Kabir Mehta', exam: 'JEE Main', xp: 2150, streak: 19 },
  { name: 'Sneha Nair', exam: 'Class 12 Boards', xp: 1480, streak: 14 },
  { name: 'Vivaan Gupta', exam: 'Class 10 Boards', xp: 890, streak: 9 },
  { name: 'Priya Singh', exam: 'JEE Main', xp: 420, streak: 5 }
];

export function getLeagueTier(xp = 0) {
  if (xp >= 3500) return { name: 'Grandmaster League', badge: '👑', color: '#fbbf24' };
  if (xp >= 2000) return { name: 'Diamond League', badge: '💎', color: '#38bdf8' };
  if (xp >= 1000) return { name: 'Gold League', badge: '🥇', color: '#f59e0b' };
  if (xp >= 400) return { name: 'Silver League', badge: '🥈', color: '#cbd5e1' };
  return { name: 'Bronze League', badge: '🥉', color: '#fb923c' };
}

export function buildGlobalLeaderboard(userName = 'You', userXp = 120, userStreak = 1) {
  const rows = [
    ...GLOBAL_BENCHMARKS.map((b) => ({ ...b, isUser: false })),
    { name: userName || 'You', exam: 'Your Profile', xp: Number(userXp) || 0, streak: Number(userStreak) || 0, isUser: true }
  ].sort((a, b) => b.xp - a.xp);

  const ranked = rows.map((r, idx) => ({ ...r, rank: idx + 1, league: getLeagueTier(r.xp) }));
  const userRow = ranked.find((r) => r.isUser);
  return { ranked, userRow };
}

// ============================================================================
// 5. COMMUNITY NOTES LIBRARY
// ============================================================================

export const COMMUNITY_STORAGE_KEY = 'flipnote_community_notes_v8';

export const COMMUNITY_NOTES_SEED = [
  {
    id: 'comm_1',
    title: 'Electrostatics & Gauss Law — 1-Page Topper Notes',
    author: 'Aarav (99.4%ile JEE)',
    subject: 'Physics',
    upvotes: 184,
    content: `Coulomb's Law: F = k q1 q2 / r² (k = 9 × 10⁹ N·m²/C²)
Gauss's Law: Φ = q_enclosed / ε0
Infinite Wire Field: E = λ / (2πε0r)
Infinite Sheet Field: E = σ / (2ε0)
Spherical Shell Inside Field: E = 0 (inside hollow conducting shell)`
  },
  {
    id: 'comm_2',
    title: 'Class 10 Electricity & Optics — Board Full Marks Sheet',
    author: 'Ananya (98.8% CBSE)',
    subject: 'Science',
    upvotes: 142,
    content: `Ohm's Law: V = I × R at constant temperature
Electric Power: P = V × I = I²R = V² / R
Joule's Heating Law: H = I²Rt
Mirror Formula: 1/f = 1/v + 1/u
Lens Formula: 1/f = 1/v - 1/u
Power of Lens: P = 1 / f (unit Dioptre D)`
  },
  {
    id: 'comm_3',
    title: 'Organic Named Reactions — Rapid JEE Revision',
    author: 'Rohan (AIR 1840)',
    subject: 'Chemistry',
    upvotes: 129,
    content: `Aldol Condensation: Aldehydes/ketones with α-H + dil. NaOH → β-hydroxy carbonyl
Cannizzaro Reaction: Aldehydes without α-H + conc. NaOH → alcohol + carboxylate salt
Reimer-Tiemann: Phenol + CHCl3 + aq. NaOH → Salicylaldehyde
Hoffmann Bromamide: R-CONH2 + Br2 + 4NaOH → R-NH2 (1 carbon less)`
  },
  {
    id: 'comm_4',
    title: 'Calculus Definite Integrals & Limits Shortcuts',
    author: 'Kabir (JEE Maths)',
    subject: 'Mathematics',
    upvotes: 116,
    content: `Standard Trig Limit: lim(x→0) sin(x)/x = 1
Exponential Limit: lim(x→0) (e^x - 1)/x = 1
King's Property: ∫(a to b) f(x) dx = ∫(a to b) f(a + b - x) dx
Derivative of tan⁻¹(x): d/dx [tan⁻¹(x)] = 1 / (1 + x²)`
  }
];

export function loadCommunityNotes() {
  const saved = safeGet(COMMUNITY_STORAGE_KEY, null);
  if (Array.isArray(saved) && saved.length) return saved;
  safeSet(COMMUNITY_STORAGE_KEY, COMMUNITY_NOTES_SEED);
  return COMMUNITY_NOTES_SEED;
}

export function upvoteCommunityNote(id) {
  const list = loadCommunityNotes();
  const item = list.find((x) => x.id === id);
  if (item) {
    item.upvotes = (item.upvotes || 0) + 1;
    safeSet(COMMUNITY_STORAGE_KEY, list);
  }
  return list;
}

export function publishCommunityNote({ title, author, subject, content }) {
  const list = loadCommunityNotes();
  const rec = {
    id: uid(),
    title: String(title || 'Shared Study Note').trim(),
    author: String(author || 'FLIPNOTE Student').trim(),
    subject: String(subject || 'General').trim(),
    upvotes: 1,
    content: String(content || '').trim()
  };
  list.unshift(rec);
  safeSet(COMMUNITY_STORAGE_KEY, list);
  return rec;
}

// ============================================================================
// 6. FLIPNOTE BRAIN (UNIFIED SECOND-BRAIN CROSS-SEARCH)
// ============================================================================

export function searchFlipnoteBrain(query = '', { notes = [], sets = [], mistakes = [] } = {}) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return { notes: [], formulas: [], flashcards: [], mistakes: [], total: 0 };

  const matchedNotes = (notes || []).filter(
    (n) => (n.title || '').toLowerCase().includes(q) || (n.content || '').toLowerCase().includes(q) || (n.subject || '').toLowerCase().includes(q)
  );

  const formulas = extractFormulasFromNotes(notes || []).filter(
    (f) => f.label.toLowerCase().includes(q) || f.expression.toLowerCase().includes(q) || f.subject.toLowerCase().includes(q)
  );

  const flashcards = [];
  for (const s of sets || []) {
    for (const c of s.cards || []) {
      if ((c.front || '').toLowerCase().includes(q) || (c.back || '').toLowerCase().includes(q)) {
        flashcards.push({ ...c, setTitle: s.title });
      }
    }
  }

  const matchedMistakes = (mistakes || []).filter(
    (m) => (m.question || '').toLowerCase().includes(q) || (m.correctAnswer || '').toLowerCase().includes(q)
  );

  return {
    notes: matchedNotes,
    formulas,
    flashcards: flashcards.slice(0, 12),
    mistakes: matchedMistakes.slice(0, 10),
    total: matchedNotes.length + formulas.length + flashcards.length + matchedMistakes.length
  };
}

// ============================================================================
// 7. LECTURES TO NOTES (TRANSCRIPT CLEANER & STRUCTURER)
// ============================================================================

export function convertLectureToNotes(rawTranscript = '', title = 'Lecture Notes') {
  const cleaned = String(rawTranscript || '')
    .replace(/\b(um+|uh+|you know|basically|actually|okay so)\b,?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!cleaned) {
    return { title, formattedContent: '', takeaways: [], keyTerms: [] };
  }

  const sentences = cleaned
    .split(/(?<=[.!?])\s+|\r?\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12);

  const takeaways = sentences.slice(0, 12);
  const keyTerms = extractTerms(cleaned).slice(0, 10);

  const formattedContent = [
    `# ${title}`,
    '',
    '## Key Lecture Takeaways',
    ...takeaways.map((s) => `- ${s}`),
    '',
    `## Key Terms: ${keyTerms.join(', ')}`
  ].join('\n');

  return { title, formattedContent, takeaways, keyTerms };
}

// ============================================================================
// 8. SOLVE WITH STEPS (OFFLINE MATH, QUADRATIC & PHYSICS SOLVER)
// ============================================================================

export function solveWithSteps(input = '') {
  const raw = String(input || '').trim();
  if (!raw) return { ok: false, title: 'Enter a problem', steps: [], answer: '' };

  // Pattern A: Quadratic ax^2 + bx + c = 0
  const quadMatch = raw
    .replace(/\s+/g, '')
    .replace(/²/g, '^2')
    .match(/^([+-]?\d*\.?\d*)x\^2([+-]\d*\.?\d*)x([+-]\d+\.?\d*)=0$/i);
  if (quadMatch) {
    const parseCoeff = (s) => (s === '' || s === '+' ? 1 : s === '-' ? -1 : Number(s));
    const a = parseCoeff(quadMatch[1]);
    const b = parseCoeff(quadMatch[2]);
    const c = Number(quadMatch[3]);
    const D = b * b - 4 * a * c;
    const steps = [
      `Step 1 — Identify coefficients: a = ${a}, b = ${b}, c = ${c}`,
      `Step 2 — Compute Discriminant: D = b² - 4ac = (${b})² - 4(${a})(${c}) = ${D}`
    ];
    if (D > 0) {
      const sqrtD = Math.sqrt(D);
      const r1 = Math.round(((-b + sqrtD) / (2 * a)) * 1000) / 1000;
      const r2 = Math.round(((-b - sqrtD) / (2 * a)) * 1000) / 1000;
      steps.push(`Step 3 — Since D > 0, two real roots: x = (-b ± √D) / 2a`);
      steps.push(`Step 4 — x₁ = (${-b} + ${sqrtD.toFixed(3)}) / ${2 * a} = ${r1},  x₂ = ${r2}`);
      return { ok: true, title: 'Quadratic Equation Solver', steps, answer: `x = ${r1}, ${r2}` };
    }
    if (D === 0) {
      const r = Math.round((-b / (2 * a)) * 1000) / 1000;
      steps.push(`Step 3 — Since D = 0, equal real roots: x = -b / 2a = ${r}`);
      return { ok: true, title: 'Quadratic Equation Solver', steps, answer: `x = ${r} (double root)` };
    }
    const real = Math.round((-b / (2 * a)) * 1000) / 1000;
    const imag = Math.round((Math.sqrt(-D) / (2 * a)) * 1000) / 1000;
    steps.push(`Step 3 — Since D < 0, complex conjugate roots: x = ${real} ± ${imag}i`);
    return { ok: true, title: 'Quadratic Equation Solver', steps, answer: `x = ${real} ± ${imag}i` };
  }

  // Pattern B: Linear equation ax + b = c
  const linMatch = raw.replace(/\s+/g, '').match(/^([+-]?\d*\.?\d*)x([+-]\d+\.?\d*)?=([+-]?\d+\.?\d*)$/i);
  if (linMatch) {
    const a = linMatch[1] === '' || linMatch[1] === '+' ? 1 : linMatch[1] === '-' ? -1 : Number(linMatch[1]);
    const b = linMatch[2] ? Number(linMatch[2]) : 0;
    const c = Number(linMatch[3]);
    const rhs = c - b;
    const x = Math.round((rhs / a) * 10000) / 10000;
    return {
      ok: true,
      title: 'Linear Equation Solver',
      steps: [
        `Step 1 — Given linear equation: ${a}x ${b >= 0 ? '+' : '-'} ${Math.abs(b)} = ${c}`,
        `Step 2 — Isolate x term: ${a}x = ${c} - (${b}) = ${rhs}`,
        `Step 3 — Divide both sides by ${a}: x = ${rhs} / ${a} = ${x}`
      ],
      answer: `x = ${x}`
    };
  }

  // Pattern C: Physics / Chemistry Formula Solver (key=val pairs like "I=3, R=5" or "u=0, a=2, t=5" or "m=4, v=10")
  const pairs = {};
  for (const m of raw.matchAll(/\b([A-Za-z]+)\s*=\s*([+-]?\d+(?:\.\d+)?)/g)) {
    pairs[m[1]] = Number(m[2]);
  }
  if (pairs.I !== undefined && pairs.R !== undefined) {
    const V = pairs.I * pairs.R;
    const P = V * pairs.I;
    return {
      ok: true,
      title: "Ohm's Law & Power Solver",
      steps: [
        `Step 1 — Given: Current I = ${pairs.I} A, Resistance R = ${pairs.R} Ω`,
        `Step 2 — Formula: V = I × R`,
        `Step 3 — Substitute: V = ${pairs.I} × ${pairs.R} = ${V} V (Power P = VI = ${P} W)`
      ],
      answer: `V = ${V} V, P = ${P} W`
    };
  }
  if (pairs.m !== undefined && pairs.a !== undefined) {
    const F = pairs.m * pairs.a;
    return {
      ok: true,
      title: "Newton's Second Law Solver",
      steps: [
        `Step 1 — Given: Mass m = ${pairs.m} kg, Acceleration a = ${pairs.a} m/s²`,
        `Step 2 — Formula: F = m × a`,
        `Step 3 — Substitute: F = ${pairs.m} × ${pairs.a} = ${F} N`
      ],
      answer: `F = ${F} N`
    };
  }
  if (pairs.m !== undefined && pairs.v !== undefined) {
    const ke = 0.5 * pairs.m * pairs.v * pairs.v;
    return {
      ok: true,
      title: 'Kinetic Energy Solver',
      steps: [
        `Step 1 — Given: Mass m = ${pairs.m} kg, Velocity v = ${pairs.v} m/s`,
        `Step 2 — Formula: KE = ½ m v²`,
        `Step 3 — Substitute: KE = 0.5 × ${pairs.m} × (${pairs.v})² = ${ke} J`
      ],
      answer: `KE = ${ke} J`
    };
  }
  if (pairs.u !== undefined && pairs.a !== undefined && pairs.t !== undefined) {
    const v = pairs.u + pairs.a * pairs.t;
    const s = pairs.u * pairs.t + 0.5 * pairs.a * pairs.t * pairs.t;
    return {
      ok: true,
      title: 'Kinematics Equations Solver',
      steps: [
        `Step 1 — Given: u = ${pairs.u} m/s, a = ${pairs.a} m/s², t = ${pairs.t} s`,
        `Step 2 — First Equation: v = u + at = ${pairs.u} + (${pairs.a})(${pairs.t}) = ${v} m/s`,
        `Step 3 — Second Equation: s = ut + ½at² = ${s} m`
      ],
      answer: `v = ${v} m/s, s = ${s} m`
    };
  }

  // Pattern D: Safe arithmetic expression (digits, + - * / ( ) . ^)
  const expr = raw.replace(/×/g, '*').replace(/÷/g, '/').replace(/\^/g, '**');
  if (/^[0-9+\-*/().\s]+$/.test(expr)) {
    try {
      const val = Function(`"use strict"; return (${expr});`)();
      if (Number.isFinite(val)) {
        const rounded = Math.round(val * 100000) / 100000;
        return {
          ok: true,
          title: 'BODMAS Arithmetic Solver',
          steps: [
            `Step 1 — Expression: ${raw}`,
            `Step 2 — Apply BODMAS order (Brackets → Orders → Division/Multiplication → Addition/Subtraction)`,
            `Step 3 — Final Computed Value = ${rounded}`
          ],
          answer: String(rounded)
        };
      }
    } catch {
      // fall through
    }
  }

  return {
    ok: false,
    title: 'Try a Supported Format',
    steps: [
      'Quadratic: x^2 - 5x + 6 = 0',
      'Linear: 3x + 7 = 22',
      'Physics: I=4, R=12  or  u=0, a=3, t=6  or  m=5, v=8',
      'Arithmetic: (25 * 4) + 18 / 3'
    ],
    answer: 'Format not recognized'
  };
}

// ============================================================================
// 9. STUDY PLANNER (SMART DAILY TIME-BLOCK GENERATOR)
// ============================================================================

export const PLANNER_STORAGE_KEY = 'flipnote_planner_v8';

export function generateSmartStudyPlan({ hoursPerDay = 4, focusSubject = 'Physics', targetExam = 'JEE Main' } = {}) {
  const hrs = Math.max(1, Math.min(12, Number(hoursPerDay) || 4));
  const blocks = [
    { id: uid(), slot: 'Block 1 (45m)', task: `${focusSubject} — Core Concept & Formula Sheet`, type: 'Concept', done: false },
    { id: uid(), slot: 'Block 2 (45m)', task: `${targetExam} PYQs & NTA CBT Practice`, type: 'Practice', done: false }
  ];
  if (hrs >= 3) {
    blocks.push({ id: uid(), slot: 'Block 3 (35m)', task: 'Mistake Notebook Re-Test & Error Analysis', type: 'Revision', done: false });
  }
  if (hrs >= 4) {
    blocks.push({ id: uid(), slot: 'Block 4 (30m)', task: 'Blur-to-Recall Curtain + 60s Formula Arcade', type: 'Active Recall', done: false });
  }
  if (hrs >= 6) {
    blocks.push({ id: uid(), slot: 'Block 5 (45m)', task: 'Secondary Subject NCERT Reading + Flashcards', type: 'NCERT', done: false });
  }
  blocks.push({ id: uid(), slot: 'Night (15m)', task: 'Sleep Revision Audio Loop (Weak Formulas)', type: 'Night Loop', done: false });

  const plan = { hoursPerDay: hrs, focusSubject, targetExam, updatedAt: Date.now(), blocks };
  safeSet(PLANNER_STORAGE_KEY, plan);
  return plan;
}

export function loadStudyPlan() {
  return safeGet(PLANNER_STORAGE_KEY, null) || generateSmartStudyPlan();
}

export function saveStudyPlan(plan) {
  safeSet(PLANNER_STORAGE_KEY, plan);
}

// ============================================================================
// 10. VISUAL LEARNING MODE (AUTO SVG FLOWCHART / CONCEPT HIERARCHY)
// ============================================================================

export function buildVisualFlowchartSvg(title = 'Concept Map', text = '') {
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = String(text || '')
    .split(/\r?\n+/)
    .map((l) => l.replace(/^[-*•#\d.)]+\s*/, '').trim())
    .filter((l) => l.length >= 6)
    .slice(0, 6);

  const nodes = lines.length ? lines : ['Core Concept', 'Key Formula', 'Exam Application', 'Common Trap'];
  const h = 110 + nodes.length * 76;

  const nodeMarkup = nodes
    .map((line, i) => {
      const y = 96 + i * 74;
      const short = line.length > 56 ? `${line.slice(0, 53)}...` : line;
      const stroke = i % 2 === 0 ? '#7c6cf8' : '#34d399';
      return `
      <line x1="340" y1="${y - 22}" x2="340" y2="${y}" stroke="#94a3b8" stroke-width="2" />
      <rect x="40" y="${y}" width="600" height="50" rx="14" fill="rgba(18,25,52,0.9)" stroke="${stroke}" stroke-width="2" />
      <text x="62" y="${y + 30}" fill="#f8fafc" font-family="sans-serif" font-size="14" font-weight="600">${i + 1}. ${esc(short)}</text>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 ${h}" style="width:100%; height:auto; border-radius:16px; background:#090d24;">
    <rect x="140" y="18" width="400" height="54" rx="18" fill="#7c6cf8" />
    <text x="340" y="51" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-size="17" font-weight="700">${esc(title.slice(0, 38))}</text>
    ${nodeMarkup}
  </svg>`;
}

// ============================================================================
// 11. PRIVACY VAULT (4-DIGIT PIN LOCKED PRIVATE NOTES)
// ============================================================================

export const VAULT_STORAGE_KEY = 'flipnote_privacy_vault_v8';

export function hashVaultPin(pin = '') {
  // Deterministic lightweight offline hash (sync-safe for Node & browser)
  let h = 2166136261;
  const s = `fn_vault_salt::${String(pin)}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export function loadVaultStore() {
  return safeGet(VAULT_STORAGE_KEY, { pinHash: null, items: [] });
}

export function setVaultPin(pin) {
  const store = loadVaultStore();
  store.pinHash = hashVaultPin(pin);
  safeSet(VAULT_STORAGE_KEY, store);
  return true;
}

export function verifyVaultPin(pin) {
  const store = loadVaultStore();
  if (!store.pinHash) return false;
  return store.pinHash === hashVaultPin(pin);
}

export function addVaultItem({ title, body }) {
  const store = loadVaultStore();
  store.items.unshift({ id: uid(), title: String(title || 'Private Note').trim(), body: String(body || '').trim(), createdAt: Date.now() });
  safeSet(VAULT_STORAGE_KEY, store);
  return store.items;
}

export function deleteVaultItem(id) {
  const store = loadVaultStore();
  store.items = (store.items || []).filter((x) => x.id !== id);
  safeSet(VAULT_STORAGE_KEY, store);
  return store.items;
}

// ============================================================================
// 12. MEMORY PALACE (LOCI METHOD SPATIAL ROOM BUILDER)
// ============================================================================

export const PALACE_STORAGE_KEY = 'flipnote_memory_palace_v8';

export const DEFAULT_PALACE_STATIONS = [
  { id: 'desk', icon: '🪑', locus: 'Study Desk', cue: 'Ohm’s Law: V = I × R', detail: 'Imagine a glowing Voltmeter sitting on your desk.' },
  { id: 'window', icon: '🪟', locus: 'Sunlit Window', cue: 'Photoelectric Effect: K_max = hν - φ₀', detail: 'Sunlight photons knocking electrons off the window sill.' },
  { id: 'bookshelf', icon: '📚', locus: 'Bookshelf', cue: 'Gauss’s Law: Φ = q_enclosed / ε₀', detail: 'Flux lines bursting out of a closed textbook box.' },
  { id: 'lamp', icon: '💡', locus: 'Corner Lamp', cue: 'YDSE Fringe Width: β = λD / d', detail: 'Light fringes glowing across the wall behind the lamp.' },
  { id: 'whiteboard', icon: '📋', locus: 'Wall Whiteboard', cue: 'King’s Integral Property', detail: '∫(a→b) f(x)dx = ∫(a→b) f(a+b-x)dx written in neon mint.' },
  { id: 'door', icon: '🚪', locus: 'Room Door', cue: 'Reimer-Tiemann Reaction', detail: 'Phenol + CHCl₃ + NaOH → Salicylaldehyde taped to the door.' }
];

export function loadMemoryPalace() {
  const saved = safeGet(PALACE_STORAGE_KEY, null);
  if (Array.isArray(saved) && saved.length) return saved;
  safeSet(PALACE_STORAGE_KEY, DEFAULT_PALACE_STATIONS);
  return DEFAULT_PALACE_STATIONS;
}

export function updatePalaceStation(id, patch) {
  const list = loadMemoryPalace();
  const idx = list.findIndex((s) => s.id === id);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...patch };
    safeSet(PALACE_STORAGE_KEY, list);
  }
  return list;
}

// ============================================================================
// 13. KNOWLEDGE UNIVERSE (CONSTELLATION GRAPH BUILDER)
// ============================================================================

export function buildKnowledgeUniverseGraph(notes = []) {
  const src = notes && notes.length
    ? notes
    : STARTER_PACKS.map((p) => ({ id: p.id, title: p.title, subject: p.subject, content: p.noteContent }));

  const subjectColors = {
    Physics: '#38bdf8',
    Chemistry: '#fbbf24',
    Mathematics: '#a78bfa',
    Science: '#34d399',
    Biology: '#fb7185',
    General: '#94a3b8'
  };

  const nodes = src.slice(0, 18).map((n, i) => {
    const angle = (i / Math.max(1, Math.min(src.length, 18))) * Math.PI * 2;
    const radius = 140 + (i % 3) * 52;
    const terms = new Set(extractTerms(`${n.title} ${n.content}`).slice(0, 25));
    return {
      id: n.id || `node_${i}`,
      title: n.title || 'Untitled',
      subject: n.subject || 'General',
      color: subjectColors[n.subject] || '#7c6cf8',
      x: Math.round(340 + Math.cos(angle) * radius),
      y: Math.round(215 + Math.sin(angle) * (radius * 0.72)),
      terms: [...terms]
    };
  });

  const edges = [];
  for (let i = 0; i < nodes.length; i++) {
    const setA = new Set(nodes[i].terms);
    for (let j = i + 1; j < nodes.length; j++) {
      let shared = 0;
      for (const t of nodes[j].terms) if (setA.has(t)) shared++;
      if (shared >= 1 || nodes[i].subject === nodes[j].subject) {
        edges.push({ from: i, to: j, weight: Math.max(1, shared) });
      }
    }
  }

  return { nodes, edges };
}
