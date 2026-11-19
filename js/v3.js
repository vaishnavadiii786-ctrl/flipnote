// FLIPNOTE v3.0 — Apple Theme Studio, Voice-to-Notes, Anki/CSV Export-Import & Print-Ready Study Sheet

import { escapeHtml, uid, renderSimpleMarkdown } from './utils.js';

export const APPLE_THEMES = [
  {
    id: 'dark',
    name: 'Midnight Dark',
    metaColor: '#000000',
    swatchBg: 'linear-gradient(145deg, #000000 0%, #1c1c1e 60%, #10203a 100%)',
    swatchAccent: '#0a84ff',
    swatchCard: 'rgba(44, 44, 46, 0.85)'
  },
  {
    id: 'light',
    name: 'macOS Light',
    metaColor: '#f5f5f7',
    swatchBg: 'linear-gradient(145deg, #ffffff 0%, #f5f5f7 60%, #e8effc 100%)',
    swatchAccent: '#007aff',
    swatchCard: 'rgba(255, 255, 255, 0.92)'
  },
  {
    id: 'liquid-glass',
    name: 'visionOS Glass',
    metaColor: '#0b1024',
    swatchBg: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 45%, #312e81 100%)',
    swatchAccent: '#5ac8fa',
    swatchCard: 'rgba(255, 255, 255, 0.16)'
  },
  {
    id: 'apple-notes',
    name: 'Warm Paper',
    metaColor: '#faf6ee',
    swatchBg: 'linear-gradient(145deg, #fdfaf3 0%, #f5eedc 65%, #efe3c6 100%)',
    swatchAccent: '#c97a16',
    swatchCard: 'rgba(255, 252, 245, 0.94)'
  },
  {
    id: 'sage-focus',
    name: 'Forest Focus',
    metaColor: '#0c1613',
    swatchBg: 'linear-gradient(145deg, #0b1411 0%, #13251f 60%, #1b362c 100%)',
    swatchAccent: '#30d158',
    swatchCard: 'rgba(27, 46, 39, 0.82)'
  }
];

const VALID_THEME_IDS = new Set(APPLE_THEMES.map((t) => t.id));

export function normalizeTheme(theme) {
  return VALID_THEME_IDS.has(theme) ? theme : 'dark';
}

export function getThemeMetaColor(theme) {
  const found = APPLE_THEMES.find((t) => t.id === normalizeTheme(theme));
  return found ? found.metaColor : '#000000';
}

export function getThemeDisplayName(theme) {
  const found = APPLE_THEMES.find((t) => t.id === normalizeTheme(theme));
  return found ? found.name : 'Midnight Dark';
}

export function getNextTheme(currentTheme) {
  const norm = normalizeTheme(currentTheme);
  const idx = APPLE_THEMES.findIndex((t) => t.id === norm);
  return APPLE_THEMES[(idx + 1) % APPLE_THEMES.length].id;
}

// ---------- 1. Voice-to-Notes (100% Free Browser Web Speech API) ----------
const SPEECH_LANG_MAP = {
  en: 'en-US',
  hi: 'hi-IN',
  bn: 'bn-IN',
  de: 'de-DE',
  fr: 'fr-FR',
  es: 'es-ES',
  pt: 'pt-BR',
  ar: 'ar-SA',
  ur: 'ur-PK',
  ja: 'ja-JP',
  ko: 'ko-KR',
  ta: 'ta-IN',
  te: 'te-IN',
  mr: 'mr-IN',
  gu: 'gu-IN'
};

export function getSpeechLangCode(langCode) {
  return SPEECH_LANG_MAP[langCode] || 'en-US';
}

export function isVoiceDictationSupported() {
  if (typeof window === 'undefined') return false;
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function createVoiceDictation({ lang = 'en', onFinalText, onInterimText, onStatusChange, onError }) {
  if (!isVoiceDictationSupported()) {
    return null;
  }
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = getSpeechLangCode(lang);

  let active = false;

  recognition.onstart = () => {
    active = true;
    if (onStatusChange) onStatusChange(true);
  };

  recognition.onend = () => {
    active = false;
    if (onStatusChange) onStatusChange(false);
  };

  recognition.onerror = (event) => {
    active = false;
    if (onStatusChange) onStatusChange(false);
    if (onError) onError(event?.error || 'speech_error');
  };

  recognition.onresult = (event) => {
    let finalChunk = '';
    let interimChunk = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0]?.transcript || '';
      if (event.results[i].isFinal) {
        finalChunk += transcript;
      } else {
        interimChunk += transcript;
      }
    }
    if (finalChunk && onFinalText) onFinalText(finalChunk.trim());
    if (onInterimText) onInterimText(interimChunk.trim());
  };

  return {
    start(nextLang) {
      if (nextLang) recognition.lang = getSpeechLangCode(nextLang);
      if (!active) recognition.start();
    },
    stop() {
      if (active) recognition.stop();
    },
    isActive() {
      return active;
    }
  };
}

// ---------- 2. Anki & CSV Flashcard Export / Import ----------
function escapeCsvCell(value) {
  const str = String(value ?? '').replace(/\r\n/g, '\n');
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function flashcardsToCsv(cards, { includeHeader = true } = {}) {
  const rows = [];
  if (includeHeader) {
    rows.push('Front,Back');
  }
  for (const card of cards || []) {
    rows.push(`${escapeCsvCell(card.front)},${escapeCsvCell(card.back)}`);
  }
  // UTF-8 BOM ensures Excel & Anki preserve Hindi, Arabic, CJK, and other Unicode scripts cleanly
  return `\uFEFF${rows.join('\r\n')}`;
}

export function flashcardsToAnkiTsv(cards) {
  const rows = [];
  for (const card of cards || []) {
    const front = String(card.front ?? '').replace(/\t/g, ' ').replace(/\r?\n/g, '<br>');
    const back = String(card.back ?? '').replace(/\t/g, ' ').replace(/\r?\n/g, '<br>');
    rows.push(`${front}\t${back}`);
  }
  return rows.join('\n');
}

function parseDelimitedRows(rawText, delimiter) {
  const text = String(rawText || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        row.push(cell);
        cell = '';
      } else if (ch === '\r' && next === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
        i++;
      } else if (ch === '\n' || ch === '\r') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
      } else {
        cell += ch;
      }
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export function parseCsvOrTsvFlashcards(rawText) {
  const cleaned = String(rawText || '').replace(/^\uFEFF/, '').trim();
  if (!cleaned) return [];

  const firstLine = cleaned.split(/\r?\n/)[0] || '';
  const delimiter = firstLine.includes('\t') ? '\t' : ',';
  const rows = parseDelimitedRows(cleaned, delimiter);

  const now = Date.now();
  const cards = [];

  for (let i = 0; i < rows.length; i++) {
    const cols = rows[i];
    if (!cols || cols.length < 2) continue;
    const front = String(cols[0] || '').replace(/<br\s*\/?>/gi, '\n').trim();
    const back = String(cols[1] || '').replace(/<br\s*\/?>/gi, '\n').trim();
    if (!front || !back) continue;

    if (
      i === 0 &&
      /^(front|question|term|q)$/i.test(front) &&
      /^(back|answer|definition|a)$/i.test(back)
    ) {
      continue;
    }

    cards.push({
      id: uid('card'),
      front,
      back,
      ease: 2.5,
      interval: 0,
      reps: 0,
      due: now
    });
  }
  return cards;
}

export function downloadTextFile(filename, content, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- 3. Print-Ready Study Sheet / PDF Export ----------
export function buildPrintableStudySheetHtml({ mode = 'note', title = 'Study Sheet', subject = '', content = '', summary = '', cards = [] }) {
  const safeTitle = escapeHtml(title || 'FLIPNOTE Study Sheet');
  const safeSubject = escapeHtml(subject || '');
  const dateStr = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

  let bodyHtml = '';
  if (mode === 'flashcards') {
    const rows = (cards || [])
      .map(
        (card, idx) => `
        <tr class="card-row">
          <td class="col-num">${idx + 1}</td>
          <td class="col-q">${escapeHtml(card.front).replace(/\n/g, '<br>')}</td>
          <td class="col-a">${escapeHtml(card.back).replace(/\n/g, '<br>')}</td>
        </tr>`
      )
      .join('');
    bodyHtml = `
      <p class="meta-line">${cards.length} Flashcards &middot; Generated on ${escapeHtml(dateStr)}</p>
      <table class="sheet-table">
        <thead>
          <tr>
            <th class="col-num">#</th>
            <th>Question / Prompt</th>
            <th>Answer / Key Concept</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  } else {
    const renderedNote = renderSimpleMarkdown(content || '');
    const summaryBlock = summary
      ? `<section class="summary-box"><h2>Quick Summary</h2><div>${renderSimpleMarkdown(summary)}</div></section>`
      : '';
    bodyHtml = `
      <p class="meta-line">${safeSubject ? `${safeSubject} &middot; ` : ''}${escapeHtml(dateStr)}</p>
      ${summaryBlock}
      <article class="note-body">${renderedNote}</article>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${safeTitle} — FLIPNOTE Study Sheet</title>
  <style>
    @page { margin: 16mm; size: A4; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", Roboto, "Noto Sans", "Noto Sans Devanagari", sans-serif;
      color: #1d1d1f;
      background: #ffffff;
      margin: 0;
      padding: 24px;
      line-height: 1.55;
      font-size: 13.5px;
    }
    .sheet-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      border-bottom: 1.5px solid #d2d2d7;
      padding-bottom: 12px;
      margin-bottom: 16px;
    }
    .sheet-title {
      margin: 0;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: #1d1d1f;
    }
    .brand-mark {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      color: #007aff;
      text-transform: uppercase;
    }
    .meta-line {
      margin: 0 0 18px;
      color: #6e6e73;
      font-size: 12px;
    }
    .summary-box {
      background: #f5f5f7;
      border-left: 3px solid #007aff;
      border-radius: 10px;
      padding: 12px 16px;
      margin-bottom: 20px;
      page-break-inside: avoid;
    }
    .summary-box h2 {
      margin: 0 0 6px;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #007aff;
    }
    .note-body h1, .note-body h2, .note-body h3 {
      margin: 16px 0 8px;
      color: #1d1d1f;
      letter-spacing: -0.015em;
      page-break-after: avoid;
    }
    .note-body ul { padding-left: 20px; }
    .note-body li { margin-bottom: 5px; }
    .sheet-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
    }
    .sheet-table th {
      text-align: left;
      background: #f5f5f7;
      color: #1d1d1f;
      font-size: 11.5px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 10px 12px;
      border-bottom: 1.5px solid #d2d2d7;
    }
    .sheet-table td {
      padding: 10px 12px;
      border-bottom: 1px solid #e5e5ea;
      vertical-align: top;
    }
    .card-row { page-break-inside: avoid; }
    .col-num { width: 36px; color: #6e6e73; font-weight: 600; }
    .col-q { width: 42%; font-weight: 600; color: #1d1d1f; }
    .col-a { color: #3a3a3c; }
    .sheet-footer {
      margin-top: 28px;
      padding-top: 10px;
      border-top: 1px solid #e5e5ea;
      font-size: 11px;
      color: #86868b;
      display: flex;
      justify-content: space-between;
    }
    @media print {
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <header class="sheet-header">
    <h1 class="sheet-title">${safeTitle}</h1>
    <span class="brand-mark">FLIPNOTE &middot; Study Sheet</span>
  </header>
  ${bodyHtml}
  <footer class="sheet-footer">
    <span>FLIPNOTE — Your Notes. Your Memory.</span>
    <span>100% Free &amp; Offline Study Sheet</span>
  </footer>
</body>
</html>`;
}

export function openPrintStudySheet(options) {
  const html = buildPrintableStudySheetHtml(options);
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    return false;
  }
  doc.open();
  doc.write(html);
  doc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } finally {
      setTimeout(() => iframe.remove(), 1500);
    }
  }, 150);
  return true;
}
