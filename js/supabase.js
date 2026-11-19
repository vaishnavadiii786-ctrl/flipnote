// FLIPNOTE Optional Supabase Free Integration
// Uses ONLY the public Supabase URL and public Anon Key.
// NEVER uses or stores a service_role key.
// If unconfigured or offline, local app features continue working 100%.

export const DEFAULT_SUPABASE_URL = 'https://xffnacbkcmvhaugohxzx.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_49W8RpssYsWSwPNQq1ndFQ_gzGZv38D';

export function resolveSupabaseConfig(settings = {}) {
  const supabaseUrl = (settings?.supabaseUrl || DEFAULT_SUPABASE_URL).trim().replace(/\/+$/, '');
  const supabaseAnonKey = (settings?.supabaseAnonKey || DEFAULT_SUPABASE_ANON_KEY).trim();
  return { supabaseUrl, supabaseAnonKey };
}

function isConfigured(settings) {
  const cfg = resolveSupabaseConfig(settings);
  return Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey && cfg.supabaseUrl.startsWith('https://'));
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function baseHeaders(settings) {
  const { supabaseAnonKey } = resolveSupabaseConfig(settings);
  const headers = {
    'Content-Type': 'application/json',
    'apikey': supabaseAnonKey
  };
  if (supabaseAnonKey.startsWith('eyJ')) {
    headers['Authorization'] = `Bearer ${supabaseAnonKey}`;
  }
  return headers;
}

export function isSupabaseReady(settings) {
  return isConfigured(settings);
}

export async function publishStudySetToSupabase(settings, set, authorAlias = 'Learner') {
  if (!isConfigured(settings)) throw new Error('Supabase not configured');
  const url = resolveSupabaseConfig(settings).supabaseUrl;
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
  const url = resolveSupabaseConfig(settings).supabaseUrl;
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
  const url = resolveSupabaseConfig(settings).supabaseUrl;
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
  const url = resolveSupabaseConfig(settings).supabaseUrl;
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
  const url = resolveSupabaseConfig(settings).supabaseUrl;
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
  const url = resolveSupabaseConfig(settings).supabaseUrl;
  const res = await fetch(
    `${url}/rest/v1/quiz_challenge_attempts?select=participant_alias,score,total,created_at&quiz_id=eq.${encodeURIComponent(quizId)}&order=score.desc,created_at.asc&limit=${limit}`,
    { headers: baseHeaders(settings) }
  );
  if (!res.ok) return [];
  return res.json();
}


export async function registerAppUserToSupabase(settings, { fullName, email, language = 'en' }) {
  if (!isConfigured(settings)) throw new Error('Supabase not configured');
  const { supabaseUrl } = resolveSupabaseConfig(settings);
  const body = {
    full_name: String(fullName || '').trim().slice(0, 120),
    email: String(email || '').trim().toLowerCase().slice(0, 180),
    language: String(language || 'en').slice(0, 12)
  };
  const res = await fetch(`${supabaseUrl}/rest/v1/app_users`, {
    method: 'POST',
    headers: { ...baseHeaders(settings), 'Prefer': 'return=minimal' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`User registration failed (${res.status}): ${errText}`);
  }
  return true;
}
