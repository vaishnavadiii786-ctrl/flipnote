// FLIPNOTE Optional Supabase Free Integration
// Uses ONLY the public Supabase URL and public Anon Key.
// NEVER uses or stores a service_role key.
// If unconfigured or offline, local app features continue working 100%.

function isConfigured(settings) {
  return Boolean(
    settings &&
    settings.supabaseUrl &&
    settings.supabaseAnonKey &&
    settings.supabaseUrl.startsWith('https://')
  );
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function baseHeaders(settings) {
  return {
    'Content-Type': 'application/json',
    'apikey': settings.supabaseAnonKey.trim(),
    'Authorization': `Bearer ${settings.supabaseAnonKey.trim()}`
  };
}

export function isSupabaseReady(settings) {
  return isConfigured(settings);
}

export async function publishStudySetToSupabase(settings, set, authorAlias = 'Learner') {
  if (!isConfigured(settings)) throw new Error('Supabase not configured');
  const url = settings.supabaseUrl.trim().replace(/\/+$/, '');
  const rawToken = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
  const ownerTokenHash = await sha256Hex(rawToken);

  const body = {
    title: (set.title || 'Untitled').slice(0, 150),
    description: `${(set.cards || []).length} flashcards`,
    subject: (set.subject || 'General').slice(0, 55),
    language: (set.language || 'en').slice(0, 10),
    author_alias: (authorAlias || 'Learner').slice(0, 55),
    cards: (set.cards || []).slice(0, 200).map((c) => ({ front: c.front, back: c.back })),
    is_public: true,
    owner_token_hash: ownerTokenHash
  };

  const res = await fetch(`${url}/rest/v1/public_study_sets`, {
    method: 'POST',
    headers: { ...baseHeaders(settings), 'Prefer': 'return=representation' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Supabase publish failed (${res.status}): ${errText}`);
  }
  const rows = await res.json();
  return rows[0];
}

export async function publishQuizToSupabase(settings, quiz, authorAlias = 'Learner') {
  if (!isConfigured(settings)) throw new Error('Supabase not configured');
  const url = settings.supabaseUrl.trim().replace(/\/+$/, '');
  const rawToken = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
  const ownerTokenHash = await sha256Hex(rawToken);

  const body = {
    title: (quiz.title || 'Untitled Quiz').slice(0, 150),
    subject: (quiz.subject || 'General').slice(0, 55),
    language: (quiz.language || 'en').slice(0, 10),
    author_alias: (authorAlias || 'Learner').slice(0, 55),
    questions: (quiz.questions || []).slice(0, 100),
    is_public: true,
    owner_token_hash: ownerTokenHash
  };

  const res = await fetch(`${url}/rest/v1/shared_quizzes`, {
    method: 'POST',
    headers: { ...baseHeaders(settings), 'Prefer': 'return=representation' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Supabase quiz publish failed (${res.status}): ${errText}`);
  }
  const rows = await res.json();
  return rows[0];
}

export async function fetchPublicStudySets(settings, limit = 20) {
  if (!isConfigured(settings)) return [];
  const url = settings.supabaseUrl.trim().replace(/\/+$/, '');
  const selectCols = 'id,short_code,title,description,subject,language,author_alias,cards,card_count,created_at';
  const res = await fetch(
    `${url}/rest/v1/public_study_sets?select=${selectCols}&is_public=eq.true&order=created_at.desc&limit=${limit}`,
    { headers: baseHeaders(settings) }
  );
  if (!res.ok) return [];
  return res.json();
}

export async function fetchSharedByShortCode(settings, code) {
  if (!isConfigured(settings) || !code) return null;
  const url = settings.supabaseUrl.trim().replace(/\/+$/, '');
  const cleanCode = encodeURIComponent(code.trim());

  const setRes = await fetch(
    `${url}/rest/v1/public_study_sets?select=id,short_code,title,subject,language,author_alias,cards,created_at&short_code=eq.${cleanCode}&is_public=eq.true&limit=1`,
    { headers: baseHeaders(settings) }
  );
  if (setRes.ok) {
    const rows = await setRes.json();
    if (rows && rows[0]) return { kind: 'studySet', item: rows[0] };
  }

  const quizRes = await fetch(
    `${url}/rest/v1/shared_quizzes?select=id,short_code,title,subject,language,author_alias,questions,created_at&short_code=eq.${cleanCode}&is_public=eq.true&limit=1`,
    { headers: baseHeaders(settings) }
  );
  if (quizRes.ok) {
    const rows = await quizRes.json();
    if (rows && rows[0]) return { kind: 'quiz', item: rows[0] };
  }
  return null;
}

export async function submitQuizChallengeScore(settings, quizId, alias, score, total) {
  if (!isConfigured(settings) || !quizId) return null;
  const url = settings.supabaseUrl.trim().replace(/\/+$/, '');
  const res = await fetch(`${url}/rest/v1/quiz_challenge_attempts`, {
    method: 'POST',
    headers: { ...baseHeaders(settings), 'Prefer': 'return=representation' },
    body: JSON.stringify({
      quiz_id: quizId,
      participant_alias: (alias || 'Learner').slice(0, 40),
      score,
      total
    })
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

export async function fetchQuizLeaderboard(settings, quizId, limit = 10) {
  if (!isConfigured(settings) || !quizId) return [];
  const url = settings.supabaseUrl.trim().replace(/\/+$/, '');
  const res = await fetch(
    `${url}/rest/v1/quiz_challenge_attempts?select=participant_alias,score,total,created_at&quiz_id=eq.${encodeURIComponent(quizId)}&order=score.desc,created_at.asc&limit=${limit}`,
    { headers: baseHeaders(settings) }
  );
  if (!res.ok) return [];
  return res.json();
}
