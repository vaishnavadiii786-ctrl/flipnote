// FLIPNOTE v6.0 — JEE & Class 10/12 Board Exam Suite (100% Free & Offline)
// 1. Auto Formula Sheet & Blank Recall Drill
// 2. Auto Mistake Notebook (Error Tagging + 1-Tap Re-Test)
// 3. NTA JEE CBT Exam Simulator (+4/-1 Marking + Question Palette)
// 4. Board 3-Mark / 5-Mark NCERT Keyword Answer Checker
// 5. Syllabus Tracker + Exam Countdown (JEE / Class 12 / Class 10)
// 6. 1-Tap Free Starter Packs

import { uid } from './utils.js';
import { generateDeterministicQuiz, shuffleArray } from './quiz.js';

// ============================================================================
// 1. AUTO FORMULA SHEET & BLANK RECALL DRILL
// ============================================================================

const FORMULA_PATTERN =
  /([A-Za-zα-ωΑ-ΩΔλμνρστωπεηθφψΩ0-9()[\]_²³^/+*\-·×÷\s]{1,42})\s*(=|→|⇌|∝|≈)\s*([^\n]{2,110})/;

const FORMULA_KEYWORDS =
  /\b(formula|law|equation|identity|reaction|constant|theorem|principle|rule|relation|velocity|acceleration|force|energy|power|resistance|potential|current|flux|capacitance|inductance|wavelength|frequency|enthalpy|entropy|molarity|molality|derivative|integral|sin|cos|tan|log|ln)\b/i;

export function extractFormulasFromNotes(notes = []) {
  const results = [];
  const seen = new Set();

  for (const note of notes || []) {
    if (!note || !note.content) continue;
    const subject = (note.subject || 'General').trim() || 'General';
    const noteTitle = (note.title || 'Untitled Note').trim();
    const lines = String(note.content).split(/\r?\n+/);

    for (const rawLine of lines) {
      const line = rawLine.replace(/^[-*•#\d.)]+\s*/, '').trim();
      if (line.length < 5 || line.length > 220) continue;

      let label = '';
      let expr = line;

      // Split "Label: LHS = RHS" if present
      const colonIdx = line.indexOf(':');
      if (colonIdx > 1 && colonIdx < 60) {
        const leftPart = line.slice(0, colonIdx).trim();
        const rightPart = line.slice(colonIdx + 1).trim();
        if (FORMULA_PATTERN.test(rightPart)) {
          label = leftPart;
          expr = rightPart;
        }
      }

      const match = expr.match(FORMULA_PATTERN);
      if (!match) continue;

      const lhs = match[1].trim();
      const op = match[2];
      const rhs = match[3].trim();

      // Filter out plain prose sentences that happen to contain "=" inside URLs or HTML
      if (/https?:|href=|class=|style=/i.test(line)) continue;
      if (lhs.length > 42 || rhs.length < 1) continue;
      const looksMathy =
        /[0-9²³^√∫∑±×÷·/+\-()α-ωΑ-ΩΔλμνρστωπεηθ]|→|⇌|∝/.test(`${lhs}${op}${rhs}`) ||
        FORMULA_KEYWORDS.test(line);
      if (!looksMathy) continue;

      const normalizedExpr = `${lhs} ${op} ${rhs}`;
      const dedupeKey = normalizedExpr.toLowerCase().replace(/\s+/g, '');
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      results.push({
        id: `f_${results.length + 1}_${dedupeKey.slice(0, 12)}`,
        label: label || noteTitle,
        lhs,
        op,
        rhs,
        expression: normalizedExpr,
        blanked: `${lhs} ${op} [ ________ ]`,
        subject,
        noteTitle,
        noteId: note.id || null
      });
    }
  }

  return results;
}

export function buildPrintableFormulaHtml(formulas = [], title = 'FLIPNOTE Formula Sheet') {
  const esc = (s) =>
    String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const grouped = {};
  for (const f of formulas) {
    const key = f.subject || 'General';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(f);
  }

  const sections = Object.entries(grouped)
    .map(([subj, items]) => {
      const rows = items
        .map(
          (f) => `
        <tr>
          <td class="lbl">${esc(f.label)}</td>
          <td class="expr">${esc(f.expression)}</td>
        </tr>`
        )
        .join('');
      return `
      <section class="subj-block">
        <h2>${esc(subj)} (${items.length})</h2>
        <table>
          <thead><tr><th>Concept / Law</th><th>Formula / Equation</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </section>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${esc(title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; margin: 28px; }
    header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 20px; }
    h1 { margin: 0; font-size: 22px; }
    .meta { font-size: 12px; color: #475569; }
    h2 { font-size: 15px; color: #4338ca; margin: 18px 0 8px; text-transform: uppercase; letter-spacing: 0.04em; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; font-size: 13px; }
    th { background: #f1f5f9; font-weight: 700; }
    td.lbl { width: 38%; font-weight: 600; color: #1e293b; }
    td.expr { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 600; color: #0f172a; }
    @media print { body { margin: 14px; } }
  </style>
</head>
<body>
  <header>
    <h1>${esc(title)}</h1>
    <span class="meta">${formulas.length} Formulas • Generated by FLIPNOTE v6.0</span>
  </header>
  ${sections || '<p>No formulas found.</p>'}
</body>
</html>`;
}

// ============================================================================
// 2. AUTO MISTAKE NOTEBOOK
// ============================================================================

export const MISTAKE_STORAGE_KEY = 'flipnote_mistakes_v6';

export const MISTAKE_TAGS = [
  'Silly Mistake',
  'Formula Forgot',
  'Concept Gap',
  'Calculation Error'
];

function safeStorageGet(key, fallback) {
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function safeStorageSet(key, value) {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function getMistakes() {
  const list = safeStorageGet(MISTAKE_STORAGE_KEY, []);
  return Array.isArray(list) ? list : [];
}

export function saveMistakes(list) {
  safeStorageSet(MISTAKE_STORAGE_KEY, Array.isArray(list) ? list : []);
}

export function logMistakes(missedQuestions = [], meta = {}) {
  if (!Array.isArray(missedQuestions) || !missedQuestions.length) return getMistakes();
  const current = getMistakes();
  const now = Date.now();
  const subject = (meta.subject || 'General').trim() || 'General';
  const source = meta.source || 'Quiz';

  for (const q of missedQuestions) {
    if (!q || !q.question) continue;
    const key = q.question.trim().toLowerCase();
    const correctAnswer =
      Array.isArray(q.options) && typeof q.correctIndex === 'number'
        ? q.options[q.correctIndex] || ''
        : q.correctAnswer || '';
    const existing = current.find((m) => m.question.trim().toLowerCase() === key);
    if (existing) {
      existing.wrongCount = (existing.wrongCount || 1) + 1;
      existing.mastered = false;
      existing.updatedAt = now;
      if (q.selectedAnswer) existing.lastWrongAnswer = q.selectedAnswer;
    } else {
      current.unshift({
        id: uid(),
        question: q.question.trim(),
        options: Array.isArray(q.options) ? q.options : [],
        correctIndex: typeof q.correctIndex === 'number' ? q.correctIndex : 0,
        correctAnswer,
        lastWrongAnswer: q.selectedAnswer || '',
        explanation: q.explanation || '',
        subject: q.subject || subject,
        source,
        tag: 'Concept Gap',
        note: '',
        wrongCount: 1,
        mastered: false,
        createdAt: now,
        updatedAt: now
      });
    }
  }

  saveMistakes(current);
  return current;
}

export function updateMistake(id, patch = {}) {
  const list = getMistakes();
  const idx = list.findIndex((m) => m.id === id);
  if (idx === -1) return list;
  list[idx] = { ...list[idx], ...patch, updatedAt: Date.now() };
  saveMistakes(list);
  return list;
}

export function deleteMistake(id) {
  const list = getMistakes().filter((m) => m.id !== id);
  saveMistakes(list);
  return list;
}

export function getMistakeStats(list = null) {
  const items = list || getMistakes();
  const total = items.length;
  const mastered = items.filter((m) => m.mastered).length;
  const active = total - mastered;
  const byTag = {};
  for (const tag of MISTAKE_TAGS) byTag[tag] = 0;
  for (const m of items) {
    if (!m.mastered) {
      const t = MISTAKE_TAGS.includes(m.tag) ? m.tag : 'Concept Gap';
      byTag[t] = (byTag[t] || 0) + 1;
    }
  }
  return { total, active, mastered, byTag };
}

export function buildRetestQuestions(mistakes = []) {
  return (mistakes || [])
    .filter((m) => !m.mastered && Array.isArray(m.options) && m.options.length >= 2)
    .map((m) => ({
      id: m.id || uid(),
      question: m.question,
      options: m.options,
      correctIndex: typeof m.correctIndex === 'number' ? m.correctIndex : 0,
      explanation: m.explanation || `Correct Answer: ${m.correctAnswer}`,
      subject: m.subject || 'General'
    }));
}

// ============================================================================
// 3. NTA JEE CBT EXAM SIMULATOR
// ============================================================================

export const MARKING_SCHEMES = {
  jee: { id: 'jee', label: 'JEE Main (+4 / -1)', correct: 4, wrong: -1, unattempted: 0 },
  board: { id: 'board', label: 'Board MCQ (+1 / 0)', correct: 1, wrong: 0, unattempted: 0 },
  standard: { id: 'standard', label: 'Standard (+1 / -0.25)', correct: 1, wrong: -0.25, unattempted: 0 }
};

export const BUILTIN_CBT_BANK = [
  {
    id: 'cbt_p1',
    subject: 'Physics',
    question: 'The SI unit of electric flux is:',
    options: ['N·m²/C', 'N·C/m²', 'J/C', 'V/m'],
    correctIndex: 0,
    explanation: 'Electric flux Φ = E·A has units (N/C)·m² = N·m²/C (also V·m).'
  },
  {
    id: 'cbt_p2',
    subject: 'Physics',
    question: 'If the length of a wire is doubled by stretching (constant volume), its resistance becomes:',
    options: ['4 times', '2 times', 'Half', '8 times'],
    correctIndex: 0,
    explanation: 'R = ρL/A. When L doubles at constant volume, A halves, so R becomes 4R.'
  },
  {
    id: 'cbt_p3',
    subject: 'Physics',
    question: 'According to Einstein’s photoelectric equation, maximum kinetic energy of emitted photoelectrons is:',
    options: ['K_max = hν - φ₀', 'K_max = hν + φ₀', 'K_max = φ₀ - hν', 'K_max = hλ - φ₀'],
    correctIndex: 0,
    explanation: 'Energy of incident photon hν = Work function φ₀ + K_max.'
  },
  {
    id: 'cbt_p4',
    subject: 'Physics',
    question: 'In a Young’s Double Slit Experiment (YDSE), fringe width β is given by:',
    options: ['λD / d', 'λd / D', 'dD / λ', '2λD / d'],
    correctIndex: 0,
    explanation: 'Fringe width β = λD / d, where D is screen distance and d is slit separation.'
  },
  {
    id: 'cbt_c1',
    subject: 'Chemistry',
    question: 'Which reaction converts phenol into salicylaldehyde using CHCl₃ and aqueous NaOH?',
    options: ['Reimer-Tiemann Reaction', 'Kolbe Reaction', 'Cannizzaro Reaction', 'Aldol Condensation'],
    correctIndex: 0,
    explanation: 'Phenol + CHCl₃ + aq. NaOH followed by acidification yields salicylaldehyde (Reimer-Tiemann).'
  },
  {
    id: 'cbt_c2',
    subject: 'Chemistry',
    question: 'Aldehydes lacking α-hydrogen undergo disproportionation in concentrated alkali via:',
    options: ['Cannizzaro Reaction', 'Aldol Condensation', 'Wurtz Reaction', 'Clemmensen Reduction'],
    correctIndex: 0,
    explanation: 'Cannizzaro reaction occurs in aldehydes without α-H (e.g., HCHO, C₆H₅CHO) giving alcohol + carboxylate salt.'
  },
  {
    id: 'cbt_c3',
    subject: 'Chemistry',
    question: 'For a first-order reaction, the half-life t₁/₂ is equal to:',
    options: ['0.693 / k', '1 / (k[A]₀)', '[A]₀ / 2k', '2.303 / k'],
    correctIndex: 0,
    explanation: 'For a first-order reaction, t₁/₂ = ln(2)/k = 0.693/k, independent of initial concentration.'
  },
  {
    id: 'cbt_c4',
    subject: 'Chemistry',
    question: 'The pH of a 10⁻³ M aqueous HCl solution at 25°C is:',
    options: ['3', '11', '1', '7'],
    correctIndex: 0,
    explanation: 'HCl is a strong acid: [H⁺] = 10⁻³ M, so pH = -log₁₀(10⁻³) = 3.'
  },
  {
    id: 'cbt_m1',
    subject: 'Mathematics',
    question: 'The value of lim(x→0) (sin x / x) is:',
    options: ['1', '0', '∞', '-1'],
    correctIndex: 0,
    explanation: 'Standard trigonometric limit: lim(x→0) (sin x / x) = 1 (x in radians).'
  },
  {
    id: 'cbt_m2',
    subject: 'Mathematics',
    question: 'The derivative of ln(x) with respect to x (for x > 0) is:',
    options: ['1 / x', 'x', 'e^x', '-1 / x²'],
    correctIndex: 0,
    explanation: 'd/dx [ln(x)] = 1/x for all x > 0.'
  },
  {
    id: 'cbt_m3',
    subject: 'Mathematics',
    question: 'If vectors a and b are perpendicular, their dot product a · b equals:',
    options: ['0', '|a||b|', '1', '-1'],
    correctIndex: 0,
    explanation: 'a · b = |a||b|cos(90°) = 0.'
  },
  {
    id: 'cbt_m4',
    subject: 'Mathematics',
    question: 'The sum of the first n natural numbers (1 + 2 + ... + n) is:',
    options: ['n(n + 1) / 2', 'n²', 'n(n - 1) / 2', 'n(n + 1)(2n + 1) / 6'],
    correctIndex: 0,
    explanation: 'Arithmetic progression sum formula: S_n = n(n + 1) / 2.'
  }
];

export function buildCbtQuestionPool({
  notes = [],
  quizzes = [],
  subjectFilter = 'All',
  count = 15,
  includeBuiltinFallback = true
} = {}) {
  const pool = [];
  const seen = new Set();

  const pushQ = (q, subj) => {
    if (!q || !q.question || !Array.isArray(q.options) || q.options.length < 2) return;
    const key = q.question.trim().toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const finalSubj = (q.subject || subj || 'General').trim();
    if (subjectFilter !== 'All' && finalSubj.toLowerCase() !== subjectFilter.toLowerCase()) return;
    pool.push({
      id: q.id || uid(),
      subject: finalSubj,
      question: q.question.trim(),
      options: q.options.slice(0, 4),
      correctIndex: typeof q.correctIndex === 'number' ? q.correctIndex : 0,
      explanation: q.explanation || ''
    });
  };

  for (const quiz of quizzes || []) {
    for (const q of quiz.questions || []) {
      pushQ(q, quiz.subject || 'General');
    }
  }

  for (const note of notes || []) {
    const qs = generateDeterministicQuiz(note.content || '', 6);
    for (const q of qs) {
      pushQ(q, note.subject || 'General');
    }
  }

  if (includeBuiltinFallback && pool.length < count) {
    for (const q of BUILTIN_CBT_BANK) {
      // Shuffle options for builtin questions so answer isn't always option A!
      const correctText = q.options[q.correctIndex];
      const shuffledOpts = shuffleArray(q.options);
      pushQ(
        {
          ...q,
          options: shuffledOpts,
          correctIndex: shuffledOpts.indexOf(correctText)
        },
        q.subject
      );
    }
  }

  return shuffleArray(pool).slice(0, Math.max(1, count));
}

export function scoreCbtAttempt(questions = [], responses = {}, schemeId = 'jee') {
  const scheme = MARKING_SCHEMES[schemeId] || MARKING_SCHEMES.jee;
  let score = 0;
  let correct = 0;
  let wrong = 0;
  let unattempted = 0;
  const bySubject = {};
  const missedQuestions = [];

  for (const q of questions) {
    const subj = q.subject || 'General';
    if (!bySubject[subj]) {
      bySubject[subj] = { subject: subj, total: 0, correct: 0, wrong: 0, unattempted: 0, score: 0, maxScore: 0 };
    }
    const bucket = bySubject[subj];
    bucket.total += 1;
    bucket.maxScore += scheme.correct;

    const r = responses[q.id];
    const selectedIdx = r && typeof r.selectedIndex === 'number' ? r.selectedIndex : null;

    if (selectedIdx === null) {
      unattempted += 1;
      bucket.unattempted += 1;
      score += scheme.unattempted;
      bucket.score += scheme.unattempted;
    } else if (selectedIdx === q.correctIndex) {
      correct += 1;
      bucket.correct += 1;
      score += scheme.correct;
      bucket.score += scheme.correct;
    } else {
      wrong += 1;
      bucket.wrong += 1;
      score += scheme.wrong;
      bucket.score += scheme.wrong;
      missedQuestions.push({
        ...q,
        selectedAnswer: q.options[selectedIdx] || ''
      });
    }
  }

  const maxScore = questions.length * scheme.correct;
  const attempted = correct + wrong;
  const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;

  return {
    scheme,
    score: Math.round(score * 100) / 100,
    maxScore,
    total: questions.length,
    attempted,
    correct,
    wrong,
    unattempted,
    accuracy,
    bySubject: Object.values(bySubject),
    missedQuestions
  };
}

// ============================================================================
// 4. BOARD 3-MARK / 5-MARK NCERT KEYWORD ANSWER CHECKER
// ============================================================================

export const BOARD_SAMPLE_QUESTIONS = [
  {
    id: 'bq_10_ohm',
    board: 'Class 10 Science',
    marks: 3,
    question: 'State Ohm’s Law and list the factors on which the resistance of a conductor depends.',
    keywords: [
      'potential difference',
      'current',
      'proportional',
      'constant temperature',
      'V = IR',
      'length',
      'area of cross-section',
      'nature of material',
      'temperature',
      'resistivity'
    ],
    modelAnswer:
      'Ohm’s Law states that the potential difference (V) across the ends of a metallic conductor is directly proportional to the current (I) flowing through it, provided its temperature remains constant (V = IR). Resistance depends on: (1) Length of conductor (R ∝ L), (2) Area of cross-section (R ∝ 1/A), (3) Nature of material (resistivity ρ), and (4) Temperature.'
  },
  {
    id: 'bq_10_heart',
    board: 'Class 10 Science',
    marks: 5,
    question: 'Explain double circulation in human beings. Why is it necessary in mammals and birds?',
    keywords: [
      'twice',
      'pulmonary circulation',
      'systemic circulation',
      'oxygenated',
      'deoxygenated',
      'right ventricle',
      'lungs',
      'left atrium',
      'aorta',
      'energy',
      'body temperature',
      'four-chambered'
    ],
    modelAnswer:
      'In human beings, blood passes through the heart twice during one complete cycle, called double circulation. It consists of: (1) Pulmonary circulation: deoxygenated blood from the right ventricle goes to the lungs for oxygenation and returns to the left atrium. (2) Systemic circulation: oxygenated blood from the left ventricle is pumped via the aorta to the whole body and deoxygenated blood returns to the right atrium. A four-chambered heart prevents mixing of oxygenated and deoxygenated blood, ensuring high oxygen supply needed by warm-blooded mammals and birds to maintain constant body temperature and high energy demands.'
  },
  {
    id: 'bq_12_gauss',
    board: 'Class 12 Physics',
    marks: 3,
    question: 'State Gauss’s Law in electrostatics and write the electric field due to an infinitely long straight uniformly charged wire.',
    keywords: [
      'electric flux',
      'closed surface',
      '1/ε0',
      'enclosed charge',
      'Gaussian surface',
      'cylindrical',
      'linear charge density',
      'λ',
      '2πε0r',
      'radially'
    ],
    modelAnswer:
      'Gauss’s Law states that the total electric flux through any closed surface is equal to 1/ε0 times the net charge enclosed by the surface (Φ = q_enclosed / ε0). Using a coaxial cylindrical Gaussian surface around an infinitely long wire of linear charge density λ, the electric field at distance r is E = λ / (2πε0r), directed radially outward for positive charge.'
  },
  {
    id: 'bq_12_photo',
    board: 'Class 12 Physics',
    marks: 5,
    question: 'State the laws of photoelectric emission and explain them using Einstein’s photoelectric equation.',
    keywords: [
      'threshold frequency',
      'work function',
      'instantaneous',
      'intensity',
      'photoelectric current',
      'stopping potential',
      'maximum kinetic energy',
      'photon',
      'hν',
      'K_max = hν - φ0'
    ],
    modelAnswer:
      'Laws of photoelectric emission: (1) Emission occurs only above a minimum threshold frequency ν₀. (2) Photoelectric current is directly proportional to light intensity. (3) Maximum kinetic energy depends linearly on frequency and is independent of intensity. (4) Emission is instantaneous. According to Einstein’s photoelectric equation, each photon carries energy hν; part is used as work function φ₀ = hν₀ and the rest becomes maximum kinetic energy: K_max = hν - φ₀ = eV₀.'
  },
  {
    id: 'bq_10_soap',
    board: 'Class 10 Science',
    marks: 3,
    question: 'Explain the cleansing action of soap with the help of micelle formation.',
    keywords: [
      'hydrophilic',
      'hydrophobic',
      'ionic end',
      'hydrocarbon',
      'micelle',
      'oil',
      'dirt',
      'emulsion',
      'water',
      'rinsed'
    ],
    modelAnswer:
      'A soap molecule has two ends: a hydrophilic (water-loving) ionic end and a hydrophobic (water-repelling) hydrocarbon tail. In water, soap molecules arrange into spherical clusters called micelles where hydrophobic tails trap oily dirt at the center and hydrophilic heads face outward toward water. This forms an emulsion in water, allowing dirt to be easily rinsed away.'
  },
  {
    id: 'bq_12_faraday',
    board: 'Class 12 Physics',
    marks: 3,
    question: 'State Faraday’s laws of electromagnetic induction and Lenz’s law.',
    keywords: [
      'magnetic flux',
      'induced emf',
      'rate of change',
      'e = -dΦ/dt',
      'opposes',
      'cause',
      'conservation of energy',
      'polarity'
    ],
    modelAnswer:
      'Faraday’s First Law: Whenever the magnetic flux linked with a closed circuit changes, an induced emf is produced. Second Law: The magnitude of induced emf is directly proportional to the rate of change of magnetic flux (e = -N dΦ/dt). Lenz’s Law states that the polarity of induced emf always opposes the change in magnetic flux that produced it, which follows the law of conservation of energy.'
  }
];

const BOARD_STOP_WORDS = new Set([
  'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'a', 'an', 'and', 'or', 'of', 'to',
  'in', 'for', 'with', 'by', 'from', 'as', 'that', 'this', 'it', 'its', 'on', 'at', 'which',
  'have', 'has', 'had', 'do', 'does', 'did', 'can', 'will', 'shall', 'may', 'into', 'about',
  'than', 'then', 'when', 'where', 'their', 'there', 'also', 'such', 'called', 'known', 'given'
]);

export function extractKeywordsFromText(text = '', limit = 12) {
  const clean = String(text || '');
  const freq = new Map();
  const words = clean.match(/[\p{L}\p{N}_=/-]{4,}/gu) || [];
  for (const w of words) {
    const low = w.toLowerCase();
    if (BOARD_STOP_WORDS.has(low) || /^\d+$/.test(low)) continue;
    freq.set(low, (freq.get(low) || 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, limit)
    .map(([w]) => w);
}

export function evaluateBoardAnswer({
  userAnswer = '',
  keywords = [],
  expectedText = '',
  marksMode = 3
} = {}) {
  const maxMarks = marksMode === 5 ? 5 : 3;
  const idealMin = maxMarks === 5 ? 100 : 45;
  const idealMax = maxMarks === 5 ? 190 : 100;

  const trimmed = String(userAnswer || '').trim();
  const words = trimmed ? trimmed.split(/\s+/).filter(Boolean) : [];
  const wordCount = words.length;

  const rubricKeywords =
    Array.isArray(keywords) && keywords.length
      ? keywords
      : extractKeywordsFromText(expectedText, maxMarks === 5 ? 12 : 8);

  if (!trimmed || !rubricKeywords.length) {
    return {
      estimatedMarks: 0,
      maxMarks,
      percent: 0,
      wordCount,
      idealRange: `${idealMin}–${idealMax} words`,
      matchedKeywords: [],
      missedKeywords: rubricKeywords,
      structureTips: ['Write your answer first to get an NCERT keyword & Board marking check.'],
      verdict: 'No answer submitted yet.'
    };
  }

  const lowerAnswer = trimmed.toLowerCase();
  const matchedKeywords = [];
  const missedKeywords = [];

  for (const kw of rubricKeywords) {
    const kwLow = String(kw).toLowerCase().trim();
    if (!kwLow) continue;
    // Match full phrase OR all core tokens (4+ char stem match)
    let hit = lowerAnswer.includes(kwLow);
    if (!hit && kwLow.includes(' ')) {
      const parts = kwLow.split(/\s+/).filter((p) => p.length >= 3 && !BOARD_STOP_WORDS.has(p));
      hit = parts.length > 0 && parts.every((p) => lowerAnswer.includes(p.slice(0, Math.min(p.length, 5))));
    } else if (!hit && kwLow.length >= 5) {
      hit = lowerAnswer.includes(kwLow.slice(0, 5));
    }

    if (hit) matchedKeywords.push(kw);
    else missedKeywords.push(kw);
  }

  const kwRatio = rubricKeywords.length ? matchedKeywords.length / rubricKeywords.length : 0;

  // Word count score (0..1)
  let lengthScore = 1;
  if (wordCount < idealMin) {
    lengthScore = Math.max(0.2, wordCount / idealMin);
  } else if (wordCount > idealMax * 1.4) {
    lengthScore = 0.85;
  }

  // Structure check: bullet/numbered points or equations
  const hasBullets = /(^|\n)\s*([-*•]|\d+[.)]|\([a-z0-9]\))/i.test(trimmed);
  const hasEquation = /[=∝→λφε]/.test(trimmed);
  const hasMultiParagraph = trimmed.split(/\n+/).filter((l) => l.trim().length > 10).length >= 2;
  const structureScore = Math.min(1, (hasBullets ? 0.5 : 0.2) + (hasEquation ? 0.3 : 0.1) + (hasMultiParagraph ? 0.25 : 0.1));

  // Weighted Board score: 70% NCERT keywords, 20% length, 10% presentation/structure
  const rawFraction = kwRatio * 0.7 + lengthScore * 0.2 + structureScore * 0.1;
  // Round to nearest 0.5 mark (just like CBSE / State Board examiners!)
  const estimatedMarks = Math.min(maxMarks, Math.round(rawFraction * maxMarks * 2) / 2);
  const percent = Math.round((estimatedMarks / maxMarks) * 100);

  const structureTips = [];
  if (wordCount < idealMin) {
    structureTips.push(`Expand your answer slightly — aim for ${idealMin}–${idealMax} words for a ${maxMarks}-mark Board question.`);
  }
  if (!hasBullets && maxMarks === 5) {
    structureTips.push('Use numbered points or sub-headings — Board examiners award step-marking faster on structured answers.');
  }
  if (!hasEquation) {
    structureTips.push('Include the exact formula, equation, or labelled diagram note wherever applicable.');
  }
  if (missedKeywords.length > 0) {
    structureTips.push(`Underline and include these missing NCERT keywords: ${missedKeywords.slice(0, 4).join(', ')}.`);
  }
  if (!structureTips.length) {
    structureTips.push('Topper-level presentation! Crisp NCERT terminology, ideal length, and clean structure.');
  }

  let verdict = 'Needs more NCERT keywords — review the missed terms below.';
  if (percent >= 85) verdict = 'Full-marks Board answer! Crisp keywords and strong structure.';
  else if (percent >= 65) verdict = 'Good answer! Add the highlighted NCERT terms to hit full marks.';

  return {
    estimatedMarks,
    maxMarks,
    percent,
    wordCount,
    idealRange: `${idealMin}–${idealMax} words`,
    matchedKeywords,
    missedKeywords,
    structureTips,
    verdict
  };
}

// ============================================================================
// 5. SYLLABUS TRACKER + EXAM COUNTDOWN
// ============================================================================

export const SYLLABUS_STORAGE_KEY = 'flipnote_syllabus_v6';

export const SYLLABUS_PRESETS = {
  jee: {
    id: 'jee',
    name: 'JEE Main 2027',
    defaultTargetDate: '2027-01-22',
    subjects: {
      Physics: [
        'Units, Dimensions & Kinematics',
        'Laws of Motion & Friction',
        'Work, Energy & Power',
        'Rotational Motion',
        'Gravitation & Solids/Fluids',
        'Thermodynamics & KTG',
        'Oscillations & Waves',
        'Electrostatics & Capacitors',
        'Current Electricity',
        'Moving Charges & Magnetism',
        'EMI & Alternating Current',
        'Ray & Wave Optics',
        'Modern Physics & Semiconductors'
      ],
      Chemistry: [
        'Mole Concept & Atomic Structure',
        'Chemical Bonding & Molecular Structure',
        'Chemical & Ionic Equilibrium',
        'Chemical Thermodynamics',
        'Solutions & Electrochemistry',
        'Chemical Kinetics',
        'Periodic Table & p/d/f-Block',
        'Coordination Compounds',
        'GOC & Isomerism',
        'Hydrocarbons & Haloalkanes',
        'Alcohols, Phenols & Ethers',
        'Aldehydes, Ketones & Carboxylic Acids',
        'Amines & Biomolecules'
      ],
      Mathematics: [
        'Sets, Relations & Functions',
        'Quadratic Equations & Complex Numbers',
        'Sequences & Series',
        'Permutations, Combinations & Binomial',
        'Matrices & Determinants',
        'Straight Lines & Circles',
        'Conic Sections (Parabola, Ellipse, Hyperbola)',
        'Limits, Continuity & Differentiability',
        'Application of Derivatives',
        'Indefinite & Definite Integration',
        'Differential Equations',
        'Vectors, 3D Geometry & Probability'
      ]
    }
  },
  class12: {
    id: 'class12',
    name: 'Class 12 Boards',
    defaultTargetDate: '2027-02-15',
    subjects: {
      Physics: [
        'Electric Charges & Fields',
        'Electrostatic Potential & Capacitance',
        'Current Electricity',
        'Moving Charges & Magnetism',
        'Magnetism & Matter',
        'Electromagnetic Induction',
        'Alternating Current',
        'Electromagnetic Waves',
        'Ray Optics & Optical Instruments',
        'Wave Optics',
        'Dual Nature of Radiation & Matter',
        'Atoms & Nuclei',
        'Semiconductor Electronics'
      ],
      Chemistry: [
        'Solutions',
        'Electrochemistry',
        'Chemical Kinetics',
        'd- and f-Block Elements',
        'Coordination Compounds',
        'Haloalkanes & Haloarenes',
        'Alcohols, Phenols & Ethers',
        'Aldehydes, Ketones & Carboxylic Acids',
        'Amines',
        'Biomolecules'
      ],
      Mathematics: [
        'Relations & Functions',
        'Inverse Trigonometric Functions',
        'Matrices & Determinants',
        'Continuity & Differentiability',
        'Application of Derivatives',
        'Integrals & Applications',
        'Differential Equations',
        'Vector Algebra',
        'Three Dimensional Geometry',
        'Linear Programming & Probability'
      ]
    }
  },
  class10: {
    id: 'class10',
    name: 'Class 10 Boards',
    defaultTargetDate: '2027-02-15',
    subjects: {
      Science: [
        'Chemical Reactions & Equations',
        'Acids, Bases & Salts',
        'Metals & Non-metals',
        'Carbon & its Compounds',
        'Life Processes',
        'Control & Coordination',
        'How do Organisms Reproduce?',
        'Heredity',
        'Light — Reflection & Refraction',
        'Human Eye & Colourful World',
        'Electricity',
        'Magnetic Effects of Electric Current',
        'Our Environment'
      ],
      Mathematics: [
        'Real Numbers',
        'Polynomials',
        'Pair of Linear Equations',
        'Quadratic Equations',
        'Arithmetic Progressions',
        'Triangles & Coordinate Geometry',
        'Introduction to Trigonometry',
        'Applications of Trigonometry',
        'Circles & Areas Related to Circles',
        'Surface Areas & Volumes',
        'Statistics & Probability'
      ],
      'Social Science': [
        'Rise of Nationalism in Europe',
        'Nationalism in India',
        'Resources & Development',
        'Agriculture & Manufacturing Industries',
        'Power Sharing & Federalism',
        'Political Parties & Outcomes of Democracy',
        'Development & Sectors of Indian Economy',
        'Money, Credit & Globalisation'
      ]
    }
  }
};

export function createInitialSyllabusState(presetId = 'jee') {
  const preset = SYLLABUS_PRESETS[presetId] || SYLLABUS_PRESETS.jee;
  const chapters = [];
  for (const [subject, names] of Object.entries(preset.subjects)) {
    for (const name of names) {
      chapters.push({
        id: `${preset.id}_${subject.toLowerCase().slice(0, 3)}_${chapters.length + 1}`,
        subject,
        name,
        notes: false,
        pyq: false,
        revised: false
      });
    }
  }
  return {
    presetId: preset.id,
    examName: preset.name,
    targetDate: preset.defaultTargetDate,
    chapters
  };
}

export function loadSyllabusState() {
  const saved = safeStorageGet(SYLLABUS_STORAGE_KEY, null);
  if (saved && Array.isArray(saved.chapters) && saved.chapters.length) return saved;
  const fresh = createInitialSyllabusState('jee');
  safeStorageSet(SYLLABUS_STORAGE_KEY, fresh);
  return fresh;
}

export function saveSyllabusState(state) {
  safeStorageSet(SYLLABUS_STORAGE_KEY, state);
}

export function computeCountdown(targetDateStr, nowMs = Date.now()) {
  if (!targetDateStr) return { daysLeft: 0, label: 'Set Exam Date', urgent: false };
  const target = new Date(`${targetDateStr}T09:00:00`).getTime();
  if (!Number.isFinite(target)) return { daysLeft: 0, label: 'Invalid Date', urgent: false };
  const diffDays = Math.ceil((target - nowMs) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return { daysLeft: 0, label: 'Exam Day / Completed', urgent: true };
  return {
    daysLeft: diffDays,
    label: `${diffDays} day${diffDays === 1 ? '' : 's'} left`,
    urgent: diffDays <= 30
  };
}

export function computeSyllabusProgress(trackerState) {
  const chapters = trackerState?.chapters || [];
  let totalTicks = chapters.length * 3;
  let doneTicks = 0;
  let masteredChapters = 0;
  const bySubject = {};

  for (const ch of chapters) {
    const subj = ch.subject || 'General';
    if (!bySubject[subj]) bySubject[subj] = { subject: subj, total: 0, ticks: 0, mastered: 0 };
    bySubject[subj].total += 1;
    const t = (ch.notes ? 1 : 0) + (ch.pyq ? 1 : 0) + (ch.revised ? 1 : 0);
    doneTicks += t;
    bySubject[subj].ticks += t;
    if (t === 3) {
      masteredChapters += 1;
      bySubject[subj].mastered += 1;
    }
  }

  const overallPercent = totalTicks > 0 ? Math.round((doneTicks / totalTicks) * 100) : 0;
  const subjectStats = Object.values(bySubject).map((s) => ({
    ...s,
    percent: s.total > 0 ? Math.round((s.ticks / (s.total * 3)) * 100) : 0
  }));

  return {
    overallPercent,
    totalChapters: chapters.length,
    masteredChapters,
    subjectStats
  };
}

// ============================================================================
// 6. 1-TAP FREE STARTER PACKS (JEE + CLASS 10 & 12 BOARDS)
// ============================================================================

export const STARTER_PACKS = [
  {
    id: 'pack-10-science',
    title: 'Class 10 Science — Board High-Yield Pack',
    subject: 'Science',
    level: 'Class 10 Boards',
    badge: '10th Board',
    description: 'Electricity formulas, Ray Optics mirror/lens equations, Chemical reactions & NCERT 3/5-mark concepts.',
    noteContent: `Ohm's Law: V = I × R
Electric Power: P = V × I = I²R = V² / R
Joule's Law of Heating: H = I²Rt
Series Resistance: R_s = R1 + R2 + R3
Parallel Resistance: 1/R_p = 1/R1 + 1/R2 + 1/R3
Resistivity Formula: R = ρL / A
Mirror Formula: 1/f = 1/v + 1/u
Lens Formula: 1/f = 1/v - 1/u
Magnification (Mirror): m = -v / u = h_i / h_o
Power of Lens: P = 1 / f (in metres, unit Dioptre D)
Snell's Law of Refraction: sin(i) / sin(r) = n2 / n1
Photosynthesis Reaction: 6CO2 + 12H2O → C6H12O6 + 6O2 + 6H2O
Neutralisation Reaction: Acid + Base → Salt + Water
Double Circulation: Blood passes through the four-chambered human heart twice in one complete cycle via pulmonary and systemic circulation.
Soap Micelle Action: Soap has a hydrophilic ionic head and hydrophobic hydrocarbon tail that traps oily dirt in micelles to form an emulsion.`,
    flashcards: [
      { front: 'State Ohm’s Law formula and condition.', back: 'V = I × R at constant temperature (potential difference is directly proportional to current).' },
      { front: 'What is the Mirror Formula vs Lens Formula?', back: 'Mirror: 1/f = 1/v + 1/u. Lens: 1/f = 1/v - 1/u.' },
      { front: 'Formula for Power of a Lens and its SI unit?', back: 'P = 1 / f (f in metres). SI unit is Dioptre (D).' },
      { front: 'State Joule’s Law of Heating.', back: 'H = I²Rt (Heat is proportional to I², resistance R, and time t).' },
      { front: 'How is resistivity (ρ) related to resistance (R)?', back: 'R = ρL / A, where L is length and A is cross-sectional area.' },
      { front: 'Why is double circulation needed in mammals and birds?', back: 'It prevents mixing of oxygenated and deoxygenated blood, ensuring high energy to maintain constant body temperature.' },
      { front: 'What is a micelle in soap cleansing action?', back: 'A spherical cluster where hydrophobic tails trap oily dirt inside and hydrophilic ionic heads face water.' },
      { front: 'Write the balanced photosynthesis equation.', back: '6CO2 + 12H2O → C6H12O6 + 6O2 + 6H2O (in presence of sunlight & chlorophyll).' }
    ]
  },
  {
    id: 'pack-12-physics',
    title: 'Class 12 Physics — Complete Formula & Laws Pack',
    subject: 'Physics',
    level: 'Class 12 Boards & JEE',
    badge: '12th Physics',
    description: 'Electrostatics, Current, Magnetism, EMI, AC, Optics & Modern Physics formulas for instant revision.',
    noteContent: `Coulomb's Law: F = k q1 q2 / r² (k = 9 × 10⁹ N·m²/C²)
Gauss's Law: Φ = q_enclosed / ε0
Electric Field (Infinite Wire): E = λ / (2πε0r)
Parallel Plate Capacitance: C = ε0 A / d
Drift Velocity: v_d = -e E τ / m
Current and Drift Velocity: I = n e A v_d
Biot-Savart Law: dB = (μ0 / 4π) (I dl sinθ / r²)
Lorentz Force: F = q(E + v × B)
Faraday's Law of EMI: e = -N dΦ / dt
Inductive Reactance: X_L = ωL = 2πfL
Capacitive Reactance: X_C = 1 / (ωC) = 1 / (2πfC)
LCR Impedance: Z = √(R² + (X_L - X_C)²)
YDSE Fringe Width: β = λD / d
Einstein Photoelectric Equation: K_max = hν - φ0 = eV0
de Broglie Wavelength: λ = h / p = h / (mv)`,
    flashcards: [
      { front: 'State Gauss’s Law in electrostatics.', back: 'Total electric flux through a closed surface Φ = q_enclosed / ε0.' },
      { front: 'Electric field due to an infinitely long charged wire?', back: 'E = λ / (2πε0r), directed radially outward for positive charge.' },
      { front: 'Relation between current I and drift velocity v_d?', back: 'I = n e A v_d (n = free electron density, A = cross-sectional area).' },
      { front: 'Write the Lorentz Force equation.', back: 'F = q(E + v × B).' },
      { front: 'Formula for LCR circuit impedance Z?', back: 'Z = √(R² + (X_L - X_C)²), resonance occurs when X_L = X_C.' },
      { front: 'YDSE fringe width (β) formula?', back: 'β = λD / d (λ = wavelength, D = screen distance, d = slit separation).' },
      { front: 'Einstein’s Photoelectric Equation?', back: 'K_max = hν - φ0 = eV0 (φ0 is work function, V0 is stopping potential).' },
      { front: 'de Broglie wavelength formula?', back: 'λ = h / p = h / (mv) = h / √(2mK).' }
    ]
  },
  {
    id: 'pack-jee-organic',
    title: 'JEE Organic Chemistry — Top Named Reactions',
    subject: 'Chemistry',
    level: 'JEE Main & Class 12',
    badge: 'JEE Organic',
    description: 'High-frequency JEE & Board named reactions with reagents, substrates, and final products.',
    noteContent: `Aldol Condensation: 2 R-CH2-CHO + dil. NaOH → β-hydroxy aldehyde → α,β-unsaturated aldehyde (requires α-H)
Cannizzaro Reaction: 2 HCHO + conc. NaOH → CH3OH + HCOONa (aldehydes without α-H)
Reimer-Tiemann Reaction: Phenol + CHCl3 + aq. NaOH → Salicylaldehyde (o-hydroxybenzaldehyde)
Kolbe's Reaction: Sodium Phenoxide + CO2 (400K, 4-7 atm) → Salicylic Acid
Wurtz Reaction: 2 R-X + 2 Na (dry ether) → R-R + 2 NaX (symmetrical alkanes)
Friedel-Crafts Alkylation: Benzene + R-Cl + anhyd. AlCl3 → Alkylbenzene + HCl
Sandmeyer Reaction: Ar-N2+Cl- + CuCl/HCl → Ar-Cl + N2
Hoffmann Bromamide Degradation: R-CONH2 + Br2 + 4NaOH → R-NH2 (1 carbon less)
Clemmensen Reduction: >C=O + Zn-Hg / conc. HCl → >CH2 + H2O (acidic medium)
Wolff-Kishner Reduction: >C=O + NH2NH2 / KOH, glycol → >CH2 + N2 (basic medium)
Rosenmund Reduction: R-COCl + H2 (Pd/BaSO4) → R-CHO + HCl
Gattermann-Koch Reaction: Benzene + CO + HCl (anhyd. AlCl3/CuCl) → Benzaldehyde`,
    flashcards: [
      { front: 'Reimer-Tiemann Reaction reagent and product?', back: 'Phenol + CHCl3 + aq. NaOH → Salicylaldehyde (intermediate: dichlorocarbene :CCl2).' },
      { front: 'When does Cannizzaro Reaction occur?', back: 'In aldehydes lacking α-hydrogen (HCHO, C6H5CHO) with conc. NaOH → alcohol + carboxylate salt.' },
      { front: 'Hoffmann Bromamide Degradation converts what to what?', back: 'Primary amide (R-CONH2) + Br2/NaOH → Primary amine (R-NH2) with one fewer carbon.' },
      { front: 'Clemmensen vs Wolff-Kishner Reduction?', back: 'Both reduce C=O to CH2. Clemmensen uses Zn-Hg/HCl (acidic); Wolff-Kishner uses NH2NH2/KOH (basic).' },
      { front: 'Rosenmund Reduction reagent and product?', back: 'Acid chloride (R-COCl) + H2 over poisoned Pd/BaSO4 → Aldehyde (R-CHO).' },
      { front: 'Kolbe’s Reaction product from Phenol?', back: 'Sodium phenoxide + CO2 → Salicylic acid (2-hydroxybenzoic acid).' },
      { front: 'Sandmeyer Reaction converts diazonium salt using?', back: 'CuCl/HCl → Ar-Cl, CuBr/HBr → Ar-Br, or CuCN/KCN → Ar-CN.' },
      { front: 'Wurtz Reaction limitation?', back: 'Best for symmetrical alkanes with even carbons; fails well for tertiary halides (elimination dominates).' }
    ]
  },
  {
    id: 'pack-jee-maths',
    title: 'JEE & 12th Maths — Identities, Calculus & Vectors',
    subject: 'Mathematics',
    level: 'JEE Main & Class 12',
    badge: 'JEE Maths',
    description: 'Essential Trigonometry, Standard Limits, Derivatives, Integrals, Vectors & 3D formulas.',
    noteContent: `Double Angle Sine: sin(2x) = 2 sin(x) cos(x) = 2 tan(x) / (1 + tan²x)
Double Angle Cosine: cos(2x) = cos²x - sin²x = 2cos²x - 1 = 1 - 2sin²x
Standard Trig Limit: lim(x→0) sin(x)/x = 1
Exponential Limit: lim(x→0) (e^x - 1)/x = 1
Logarithmic Limit: lim(x→0) ln(1 + x)/x = 1
Derivative of ln(x): d/dx [ln(x)] = 1 / x
Derivative of tan⁻¹(x): d/dx [tan⁻¹(x)] = 1 / (1 + x²)
Integration by Parts (ILATE): ∫ u v dx = u ∫ v dx - ∫ (u' ∫ v dx) dx
King's Property (Definite Integral): ∫(a to b) f(x) dx = ∫(a to b) f(a + b - x) dx
Dot Product of Vectors: a · b = |a| |b| cos(θ)
Cross Product Magnitude: |a × b| = |a| |b| sin(θ)
Distance from Point to Plane: d = |Ax1 + By1 + Cz1 + D| / √(A² + B² + C²)
Quadratic Discriminant: D = b² - 4ac
Sum of First n Naturals: S_n = n(n + 1) / 2`,
    flashcards: [
      { front: 'Write all 3 forms of cos(2x).', back: 'cos²x - sin²x = 2cos²x - 1 = 1 - 2sin²x = (1 - tan²x)/(1 + tan²x).' },
      { front: 'State King’s Property of Definite Integrals.', back: '∫(a to b) f(x) dx = ∫(a to b) f(a + b - x) dx — #1 trick in JEE Definite Integration!' },
      { front: 'Derivative of tan⁻¹(x)?', back: 'd/dx [tan⁻¹(x)] = 1 / (1 + x²).' },
      { front: 'Integration by Parts formula (ILATE rule)?', back: '∫ u v dx = u ∫ v dx - ∫ (du/dx · ∫ v dx) dx.' },
      { front: 'Condition for two vectors a and b to be perpendicular?', back: 'Dot product a · b = 0.' },
      { front: 'Perpendicular distance from point (x1, y1, z1) to plane Ax + By + Cz + D = 0?', back: 'd = |Ax1 + By1 + Cz1 + D| / √(A² + B² + C²).' },
      { front: 'Value of lim(x→0) (e^x - 1) / x?', back: '1.' },
      { front: 'Value of lim(x→0) (1 + x)^(1/x)?', back: 'e (Euler’s number ≈ 2.718).' }
    ]
  }
];
