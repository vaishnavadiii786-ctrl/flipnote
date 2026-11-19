// FLIPNOTE v5.0 — Hatke Power Study Modes (100% Free & Offline)
// 1. Study Reels (Vertical Swipe Feed)
// 2. Teach It Back (Feynman Voice Recall Scorer)
// 3. Walk & Revise (Hands-Free Audio Podcast Loop)
// 4. Exam Panic Mode (Last-Night 10-Minute High-Yield Crammer)

const STOP_WORDS = new Set([
  'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for', 'with',
  'by', 'from', 'as', 'that', 'this', 'it', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'but', 'not', 'can', 'will', 'into', 'about',
  'है', 'हैं', 'का', 'की', 'के', 'को', 'में', 'से', 'पर', 'और', 'या', 'एक', 'यह', 'वह', 'था', 'थे', 'होता', 'होती'
]);

function extractKeyTerms(text) {
  const tokens = String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  return [...new Set(tokens)];
}

// ---------- 1. Teach It Back (Feynman Recall Scorer) ----------
export function scoreFeynmanRecall(spokenText, expectedAnswer) {
  const expectedTerms = extractKeyTerms(expectedAnswer);
  const spokenSet = new Set(extractKeyTerms(spokenText));

  if (!expectedTerms.length) {
    return { score: 0, matched: [], missed: [], verdict: 'Add a detailed answer to evaluate recall.' };
  }

  const matched = [];
  const missed = [];
  for (const term of expectedTerms) {
    // Allow prefix match for minor plural/verb variations
    const hit =
      spokenSet.has(term) ||
      [...spokenSet].some((s) => (s.length >= 4 && term.length >= 4 && (s.startsWith(term.slice(0, 4)) || term.startsWith(s.slice(0, 4)))));
    if (hit) matched.push(term);
    else missed.push(term);
  }

  const score = Math.round((matched.length / expectedTerms.length) * 100);
  let verdict = 'Keep practicing — review the missed keywords below.';
  if (score >= 80) verdict = 'Nailed it! You can teach this concept clearly.';
  else if (score >= 50) verdict = 'Good recall! Catch the few missed concepts below.';

  return {
    score,
    matched: matched.slice(0, 12),
    missed: missed.slice(0, 10),
    verdict
  };
}

// ---------- 2. Exam Panic Mode (High-Yield Weakest-First Deck) ----------
export function buildPanicCramDeck(allCards, maxCards = 20) {
  const unique = [];
  const seen = new Set();
  for (const card of allCards || []) {
    if (!card || !card.front || !card.back) continue;
    const key = `${card.front.trim().toLowerCase()}|${card.back.trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(card);
  }

  // Prioritize cards with lowest ease / due soonest / fewest reps
  unique.sort((a, b) => {
    const easeA = Number.isFinite(a.ease) ? a.ease : 2.5;
    const easeB = Number.isFinite(b.ease) ? b.ease : 2.5;
    if (easeA !== easeB) return easeA - easeB;
    const repsA = Number.isFinite(a.reps) ? a.reps : 0;
    const repsB = Number.isFinite(b.reps) ? b.reps : 0;
    return repsA - repsB;
  });

  return unique.slice(0, maxCards);
}

// ---------- 3. Study Reels Color Gradients ----------
export const REEL_GRADIENTS = [
  'linear-gradient(160deg, #090e24 0%, #162454 55%, #0a84ff 140%)',
  'linear-gradient(160deg, #160c28 0%, #311a5c 55%, #5e5ce6 140%)',
  'linear-gradient(160deg, #071b16 0%, #10382d 55%, #30d158 140%)',
  'linear-gradient(160deg, #21120a 0%, #422411 55%, #ff9f0a 140%)',
  'linear-gradient(160deg, #1f0a17 0%, #441530 55%, #ff375f 140%)'
];
