// FLIPNOTE Quiz Engine — Deterministic MCQ generator with source explanations

import { uid } from './utils.js';
import { putItem, getAllItems, deleteItem } from './database.js';
import { generateWithOptionalAI } from './ai.js';

export function generateDeterministicQuiz(text, targetCount = 6) {
  const clean = (text || '').trim();
  if (!clean) return [];

  const lines = clean
    .split(/\r?\n+/)
    .map((l) => l.replace(/^[-*•\d.)]+\s*/, '').trim())
    .filter((l) => l.length >= 14);

  const facts = [];
  for (const line of lines) {
    const colonMatch = line.match(/^([^:–—-]{2,65})\s*[:–—]\s*(.{10,})$/u);
    if (colonMatch) {
      facts.push({
        term: colonMatch[1].trim(),
        def: colonMatch[2].trim(),
        source: line
      });
      continue;
    }
    const copulaMatch = line.match(/^(.{3,55}?)\s+(is|are|means|refers to)\s+(.{10,})$/i);
    if (copulaMatch) {
      facts.push({
        term: copulaMatch[1].trim(),
        def: `${copulaMatch[2]} ${copulaMatch[3]}`.trim(),
        source: line
      });
      continue;
    }
    const words = line.match(/[\p{L}\p{N}-]{5,}/gu) || [];
    if (words.length >= 3) {
      const targetWord = [...words].sort((a, b) => b.length - a.length)[0];
      facts.push({
        term: targetWord,
        def: line.replace(targetWord, '______'),
        isCloze: true,
        source: line
      });
    }
  }

  if (facts.length === 0) return [];

  const termPool = facts.map((f) => f.term);
  const questions = [];

  for (let i = 0; i < facts.length && questions.length < targetCount; i++) {
    const fact = facts[i];
    const prompt = fact.isCloze
      ? `Complete the statement: "${fact.def}"`
      : `Which term matches: "${fact.def}"?`;

    // Collect up to 3 distinct distractors from other facts
    const distractors = [];
    for (let j = 0; j < termPool.length && distractors.length < 3; j++) {
      const candidate = termPool[(i + j + 1) % termPool.length];
      if (candidate.toLowerCase() !== fact.term.toLowerCase() && !distractors.includes(candidate)) {
        distractors.push(candidate);
      }
    }

    // Fallback distractors if notes have fewer than 4 distinct facts
    const fallbacks = ['None of the above', 'Unrelated process', 'Secondary stage', 'External factor'];
    let fbIdx = 0;
    while (distractors.length < 3 && fbIdx < fallbacks.length) {
      if (!distractors.includes(fallbacks[fbIdx]) && fallbacks[fbIdx] !== fact.term) {
        distractors.push(fallbacks[fbIdx]);
      }
      fbIdx++;
    }

    const options = shuffleArray([fact.term, ...distractors]);
    const correctIndex = options.indexOf(fact.term);

    questions.push({
      id: uid(),
      question: prompt,
      options,
      correctIndex,
      explanation: fact.source
    });
  }

  return questions;
}

export async function generateQuiz({ text, count = 6, language = 'en', settings = null }) {
  if (settings && settings.aiEnabled && settings.aiApiKey) {
    try {
      const aiQs = await generateWithOptionalAI({
        settings,
        task: 'quiz',
        text,
        count,
        targetLanguage: language
      });
      if (Array.isArray(aiQs) && aiQs.length) {
        return aiQs.map((q) => ({
          id: uid(),
          question: q.question || '',
          options: Array.isArray(q.options) ? q.options.slice(0, 4) : [],
          correctIndex: typeof q.correctIndex === 'number' ? q.correctIndex : 0,
          explanation: q.explanation || ''
        }));
      }
    } catch (err) {
      console.warn('Optional AI quiz failed, using deterministic generator:', err);
    }
  }
  return generateDeterministicQuiz(text, count);
}

export function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export async function saveQuizRecord({ id, title, subject, language, questions }) {
  const now = Date.now();
  const quiz = {
    id: id || uid(),
    type: 'quiz',
    title: (title || '').trim() || 'Untitled Quiz',
    subject: (subject || '').trim() || 'General',
    language: language || 'en',
    questions: questions || [],
    createdAt: now,
    updatedAt: now
  };
  await putItem('quizzes', quiz);
  return quiz;
}

export async function recordQuizAttempt({ quizId, title, score, total, missedQuestions = [] }) {
  const entry = {
    id: uid(),
    quizId: quizId || null,
    title: title || 'Quiz',
    score,
    total,
    percent: total > 0 ? Math.round((score / total) * 100) : 0,
    missedTopics: missedQuestions.map((q) => q.question).slice(0, 5),
    createdAt: Date.now()
  };
  await putItem('quizHistory', entry);
  return entry;
}

export async function listQuizzes() {
  return getAllItems('quizzes');
}

export async function removeQuiz(id) {
  return deleteItem('quizzes', id);
}
