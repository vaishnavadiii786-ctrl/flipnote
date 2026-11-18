// FLIPNOTE Smart Notes — Local notes CRUD, search, lazy-loaded PDF.js & Tesseract.js OCR

import { putItem, getAllItems, deleteItem } from './database.js';
import { uid } from './utils.js';

let pdfJsLoaded = null;
let tesseractLoaded = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

export async function extractPdfText(file) {
  if (!pdfJsLoaded) {
    pdfJsLoaded = (async () => {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.min.mjs').catch(async () => {
        // Fallback to classic UMD build for broad browser compatibility
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
      });
    })();
  }
  await pdfJsLoaded;

  const pdfjsLib = window.pdfjsLib;
  if (!pdfjsLib) {
    throw new Error('PDF engine unavailable');
  }
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map((item) => item.str);
    pages.push(strings.join(' ').replace(/\s+/g, ' ').trim());
  }
  return pages.filter(Boolean).join('\n\n');
}

export async function extractImageTextOCR(file, langCode = 'eng') {
  if (!tesseractLoaded) {
    tesseractLoaded = loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
  }
  await tesseractLoaded;
  if (!window.Tesseract) {
    throw new Error('OCR engine unavailable');
  }
  const mapLang = {
    en: 'eng', hi: 'hin', bn: 'ben', de: 'deu', fr: 'fra',
    es: 'spa', pt: 'por', ar: 'ara', ur: 'urd', ja: 'jpn',
    ko: 'kor', ta: 'tam', te: 'tel', mr: 'mar', gu: 'guj'
  };
  const tessLang = mapLang[langCode] || 'eng';
  const result = await window.Tesseract.recognize(file, tessLang);
  return (result?.data?.text || '').trim();
}

export async function saveNoteRecord({ id, title, subject, content, language }) {
  const now = Date.now();
  const note = {
    id: id || uid(),
    title: (title || '').trim() || 'Untitled Note',
    subject: (subject || '').trim() || 'General',
    content: (content || '').trim(),
    language: language || 'en',
    createdAt: id ? undefined : now,
    updatedAt: now
  };
  if (id) {
    const existing = (await getAllItems('notes')).find((n) => n.id === id);
    note.createdAt = existing ? existing.createdAt : now;
  } else {
    note.createdAt = now;
  }
  await putItem('notes', note);
  return note;
}

export async function listNotes(query = '') {
  const all = await getAllItems('notes');
  const q = query.trim().toLowerCase();
  if (!q) return all;
  return all.filter((n) =>
    (n.title || '').toLowerCase().includes(q) ||
    (n.subject || '').toLowerCase().includes(q) ||
    (n.content || '').toLowerCase().includes(q)
  );
}

export async function removeNote(id) {
  return deleteItem('notes', id);
}

export const SAMPLE_NOTE = {
  title: 'Cell Biology — Mitosis & Energy',
  subject: 'Biology',
  content: `Mitosis: Cell division that results in two genetically identical daughter cells from a single parent cell.
Interphase: The longest phase of the cell cycle where DNA replication occurs before division.
Prophase: Chromatin condenses into visible chromosomes and the nuclear envelope begins to break down.
Metaphase: Chromosomes align along the metaphase plate at the equator of the cell.
Anaphase: Sister chromatids separate and move toward opposite poles of the cell.
Telophase: Nuclear membranes reform around each set of chromosomes and chromosomes decondense.
Mitochondria: Membrane-bound organelles known as the powerhouse of the cell because they generate ATP.
ATP (Adenosine Triphosphate): The primary energy-carrying molecule used by living cells for metabolic work.
Photosynthesis: The process by which green plants convert light energy into chemical energy stored in glucose.
Chloroplast: The organelle in plant cells where photosynthesis takes place using chlorophyll.`
};

export function generateDeterministicSummary(text, maxPoints = 5) {
  const clean = (text || '').trim();
  if (!clean) return [];
  const rawUnits = clean
    .split(/\r?\n+/)
    .map((l) => l.replace(/^[-*•\d.)]+\s*/, '').trim())
    .filter((l) => l.length >= 16);

  const scored = rawUnits.map((line, idx) => {
    let score = 0;
    if (line.includes(':') || line.includes('—')) score += 3;
    if (idx === 0) score += 1;
    if (line.length >= 35 && line.length <= 220) score += 2;
    return { line, score, idx };
  });

  return scored
    .sort((a, b) => b.score - a.score || a.idx - b.idx)
    .slice(0, maxPoints)
    .sort((a, b) => a.idx - b.idx)
    .map((x) => x.line);
}
