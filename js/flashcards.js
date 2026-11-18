// FLIPNOTE Flashcard Generator — Deterministic Unicode-aware Q&A extraction + optional AI hook

import { uid } from './utils.js';
import { putItem, getAllItems, deleteItem } from './database.js';
import { generateWithOptionalAI } from './ai.js';

/**
 * Deterministic text-to-flashcard extractor.
 * Works offline across Latin, Devanagari, Bengali, Arabic, CJK, etc.
 * Does NOT pretend to be LLM-level AI; extracts structured definitions,
 * key-value pairs, bullet facts, and cloze-style recall prompts.
 */
export function generateDeterministicFlashcards(text, targetCount = 10, language = 'en') {
  const clean = (text || '').trim();
  if (!clean) return [];

  const lines = clean
    .split(/\r?\n+/)
    .map((l) => l.replace(/^[-*•\d.)]+\s*/, '').trim())
    .filter((l) => l.length >= 12);

  // Also split long paragraphs into sentences (supporting ., ।, ?, !, 。)
  const units = [];
  for (const line of lines) {
    if (line.length > 180 && !line.includes(':')) {
      const parts = line.split(/(?<=[.!?।。])\s+/u).map((s) => s.trim()).filter((s) => s.length >= 14);
      units.push(...parts);
    } else {
      units.push(line);
    }
  }

  const cards = [];
  const seenFronts = new Set();

  for (const unit of units) {
    if (cards.length >= targetCount) break;

    // Pattern 1: "Term: Definition" or "Term - Definition" or "Term — Definition"
    const colonMatch = unit.match(/^([^:–—-]{2,70})\s*[:–—]\s*(.{8,})$/u);
    if (colonMatch) {
      const term = colonMatch[1].trim();
      const def = colonMatch[2].trim();
      const front = term;
      if (!seenFronts.has(front.toLowerCase())) {
        seenFronts.add(front.toLowerCase());
        cards.push(makeCard(front, def, unit));
        continue;
      }
    }

    // Pattern 2: "X is/are/means/refers to Y" (English & general)
    const copulaMatch = unit.match(/^(.{3,60}?)\s+(is|are|means|refers to|defines)\s+(.{10,})$/i);
    if (copulaMatch) {
      const subject = copulaMatch[1].trim();
      const predicate = `${copulaMatch[2]} ${copulaMatch[3]}`.trim();
      const front = `What ${copulaMatch[2].toLowerCase() === 'are' ? 'are' : 'is'} ${subject}?`;
      if (!seenFronts.has(front.toLowerCase())) {
        seenFronts.add(front.toLowerCase());
        cards.push(makeCard(front, predicate, unit));
        continue;
      }
    }

    // Pattern 3: Cloze / Fill-in-the-blank on the longest meaningful word (>4 chars)
    const words = unit.match(/[\p{L}\p{N}-]{5,}/gu) || [];
    if (words.length >= 2) {
      // Pick a salient word near middle/end
      const candidate = words.sort((a, b) => b.length - a.length)[0];
      const blanked = unit.replace(candidate, '______');
      if (blanked !== unit && !seenFronts.has(blanked.toLowerCase())) {
        seenFronts.add(blanked.toLowerCase());
        cards.push(makeCard(blanked, candidate, unit));
      }
    }
  }

  return cards.slice(0, targetCount);
}

function makeCard(front, back, source = '') {
  return {
    id: uid(),
    front: front.trim(),
    back: back.trim(),
    source: source.trim(),
    ease: 'new',
    nextReviewAt: Date.now(),
    reviewCount: 0
  };
}

export async function generateFlashcards({ text, count = 10, language = 'en', settings = null }) {
  if (settings && settings.aiEnabled && settings.aiApiKey) {
    try {
      const aiCards = await generateWithOptionalAI({
        settings,
        task: 'flashcards',
        text,
        count,
        targetLanguage: language
      });
      if (Array.isArray(aiCards) && aiCards.length) {
        return aiCards.map((c) => makeCard(c.front || '', c.back || '', c.back || ''));
      }
    } catch (err) {
      console.warn('Optional AI failed, falling back to deterministic generator:', err);
    }
  }
  return generateDeterministicFlashcards(text, count, language);
}

export async function saveStudySet({ id, title, subject, language, cards, noteId = null }) {
  const now = Date.now();
  let createdAt = now;
  if (id) {
    const existing = (await getAllItems('studySets')).find((s) => s.id === id);
    if (existing) createdAt = existing.createdAt;
  }
  const set = {
    id: id || uid(),
    type: 'studySet',
    title: (title || '').trim() || 'Untitled Study Set',
    subject: (subject || '').trim() || 'General',
    language: language || 'en',
    noteId,
    cards: cards || [],
    createdAt,
    updatedAt: now,
    lastStudiedAt: now
  };
  await putItem('studySets', set);
  return set;
}

export async function listStudySets() {
  return getAllItems('studySets');
}

export async function removeStudySet(id) {
  return deleteItem('studySets', id);
}
