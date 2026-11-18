// FLIPNOTE Spaced Revision Engine — Easy/Medium/Difficult scheduling & weak-topic identification

import { getAllItems, putItem } from './database.js';
import { uid, todayKey } from './utils.js';

const INTERVAL_MS = {
  easy: 4 * 24 * 60 * 60 * 1000,    // +4 days
  medium: 1 * 24 * 60 * 60 * 1000,  // +1 day
  difficult: 10 * 60 * 1000         // +10 minutes
};

export async function getDueCards(includeAll = false) {
  const sets = await getAllItems('studySets');
  const now = Date.now();
  const queue = [];

  for (const set of sets) {
    for (const card of set.cards || []) {
      const dueAt = card.nextReviewAt || 0;
      if (includeAll || dueAt <= now) {
        queue.push({
          setId: set.id,
          setTitle: set.title,
          subject: set.subject || 'General',
          card
        });
      }
    }
  }
  // Prioritize difficult / earliest due first
  return queue.sort((a, b) => (a.card.nextReviewAt || 0) - (b.card.nextReviewAt || 0));
}

export async function rateCard(setId, cardId, rating) {
  const sets = await getAllItems('studySets');
  const set = sets.find((s) => s.id === setId);
  if (!set) return null;

  const interval = INTERVAL_MS[rating] || INTERVAL_MS.medium;
  const now = Date.now();

  set.cards = (set.cards || []).map((c) => {
    if (c.id !== cardId) return c;
    return {
      ...c,
      ease: rating,
      lastReviewedAt: now,
      nextReviewAt: now + interval,
      reviewCount: (c.reviewCount || 0) + 1
    };
  });
  set.lastStudiedAt = now;
  set.updatedAt = now;
  await putItem('studySets', set);

  await putItem('revisionLogs', {
    id: uid(),
    setId,
    cardId,
    rating,
    day: todayKey(),
    createdAt: now
  });

  return set;
}

export async function getWeakTopics() {
  const sets = await getAllItems('studySets');
  const quizHistory = await getAllItems('quizHistory');
  const weak = [];

  for (const set of sets) {
    for (const card of set.cards || []) {
      if (card.ease === 'difficult') {
        weak.push({
          source: set.title,
          topic: card.front,
          detail: card.back,
          reason: 'Difficult'
        });
      }
    }
  }

  for (const attempt of quizHistory.slice(0, 10)) {
    for (const qText of attempt.missedTopics || []) {
      weak.push({
        source: attempt.title,
        topic: qText,
        detail: `${attempt.score}/${attempt.total} (${attempt.percent}%)`,
        reason: 'Quiz miss'
      });
    }
  }

  return weak.slice(0, 15);
}

export async function logStudySession(kind = 'flashcards', count = 1) {
  await putItem('sessions', {
    id: uid(),
    kind,
    count,
    day: todayKey(),
    createdAt: Date.now()
  });
}
