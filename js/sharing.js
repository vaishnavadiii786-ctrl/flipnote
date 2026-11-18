// FLIPNOTE Sharing & Import/Export — Method 1 (Instant URL/JSON) & Method 2 (Supabase)

import { encodeSharePayload, decodeSharePayload, downloadFile, uid } from './utils.js';

const MAX_SAFE_URL_BYTES = 6000;

export function buildCompactShareObject(kind, data) {
  if (kind === 'studySet') {
    return {
      v: 1,
      kind: 'studySet',
      title: data.title || 'Shared Study Set',
      subject: data.subject || 'General',
      language: data.language || 'en',
      cards: (data.cards || []).map((c) => ({ f: c.front, b: c.back }))
    };
  }
  if (kind === 'quiz') {
    return {
      v: 1,
      kind: 'quiz',
      title: data.title || 'Shared Quiz Challenge',
      subject: data.subject || 'General',
      language: data.language || 'en',
      questions: (data.questions || []).map((q) => ({
        q: q.question,
        o: q.options,
        c: q.correctIndex,
        e: q.explanation || ''
      }))
    };
  }
  throw new Error('Unsupported share kind');
}

export function generateInstantShareLink(kind, data) {
  const compact = buildCompactShareObject(kind, data);
  const encoded = encodeSharePayload(compact);
  const baseUrl = window.location.href.split('#')[0];
  const url = `${baseUrl}#share=${encoded}`;
  const sizeKB = (new Blob([url]).size / 1024).toFixed(1);
  const isTooLarge = url.length > MAX_SAFE_URL_BYTES;
  return { url, sizeKB, isTooLarge, compact };
}

export function exportStudyMaterialJson(kind, data) {
  const compact = buildCompactShareObject(kind, data);
  const safeName = (data.title || 'flipnote-export')
    .toLowerCase()
    .replace(/[^a-z0-9\u0900-\u097f]+/gi, '-')
    .replace(/^-|-$/g, '') || 'flipnote-export';
  downloadFile(`${safeName}.flipnote.json`, JSON.stringify(compact, null, 2));
}

export function parseImportedInput(rawInput) {
  let text = (rawInput || '').trim();
  if (!text) throw new Error('Empty input');

  // Handle full URL or #share=... hash
  const hashMatch = text.match(/#share=([A-Za-z0-9_-]+)/);
  let parsed;
  if (hashMatch) {
    parsed = decodeSharePayload(hashMatch[1]);
  } else {
    parsed = JSON.parse(text);
  }

  return normalizeSharedObject(parsed);
}

export function normalizeSharedObject(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid object');
  }

  if (parsed.kind === 'studySet' && Array.isArray(parsed.cards) && parsed.cards.length > 0) {
    return {
      kind: 'studySet',
      data: {
        id: uid(),
        type: 'studySet',
        title: String(parsed.title || 'Shared Study Set').slice(0, 160),
        subject: String(parsed.subject || 'General').slice(0, 60),
        language: String(parsed.language || 'en').slice(0, 12),
        cards: parsed.cards.map((c) => ({
          id: uid(),
          front: String(c.f ?? c.front ?? '').trim(),
          back: String(c.b ?? c.back ?? '').trim(),
          ease: 'new',
          nextReviewAt: Date.now(),
          reviewCount: 0
        })).filter((c) => c.front && c.back),
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    };
  }

  if (parsed.kind === 'quiz' && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
    return {
      kind: 'quiz',
      data: {
        id: uid(),
        type: 'quiz',
        title: String(parsed.title || 'Shared Quiz Challenge').slice(0, 160),
        subject: String(parsed.subject || 'General').slice(0, 60),
        language: String(parsed.language || 'en').slice(0, 12),
        questions: parsed.questions.map((q) => ({
          id: uid(),
          question: String(q.q ?? q.question ?? '').trim(),
          options: Array.isArray(q.o ?? q.options) ? (q.o ?? q.options).map(String).slice(0, 4) : [],
          correctIndex: Number(q.c ?? q.correctIndex ?? 0),
          explanation: String(q.e ?? q.explanation ?? '').trim()
        })).filter((q) => q.question && q.options.length >= 2),
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    };
  }

  throw new Error('Unrecognized FLIPNOTE share payload');
}
