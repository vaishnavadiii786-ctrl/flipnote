-- FLIPNOTE Supabase Row Level Security (RLS) Policies
-- Run this after schema.sql. Uses only the public anon key safely.

ALTER TABLE public.public_study_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_challenge_attempts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if re-running
DROP POLICY IF EXISTS "Public study sets are readable when is_public is true" ON public.public_study_sets;
DROP POLICY IF EXISTS "Anyone can publish a valid public study set" ON public.public_study_sets;
DROP POLICY IF EXISTS "No direct anonymous updates on study sets" ON public.public_study_sets;
DROP POLICY IF EXISTS "No direct anonymous deletes on study sets" ON public.public_study_sets;

DROP POLICY IF EXISTS "Public shared quizzes are readable when is_public is true" ON public.shared_quizzes;
DROP POLICY IF EXISTS "Anyone can publish a valid public quiz" ON public.shared_quizzes;

DROP POLICY IF EXISTS "Challenge attempts are readable for public quizzes" ON public.quiz_challenge_attempts;
DROP POLICY IF EXISTS "Anyone can submit a valid challenge score" ON public.quiz_challenge_attempts;

-- 1. public_study_sets policies
CREATE POLICY "Public study sets are readable when is_public is true"
  ON public.public_study_sets
  FOR SELECT
  TO anon, authenticated
  USING (is_public = true);

CREATE POLICY "Anyone can publish a valid public study set"
  ON public.public_study_sets
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    is_public = true
    AND char_length(title) >= 2
    AND jsonb_array_length(cards) BETWEEN 1 AND 200
    AND char_length(owner_token_hash) >= 32
  );

-- 2. shared_quizzes policies
CREATE POLICY "Public shared quizzes are readable when is_public is true"
  ON public.shared_quizzes
  FOR SELECT
  TO anon, authenticated
  USING (is_public = true);

CREATE POLICY "Anyone can publish a valid public quiz"
  ON public.shared_quizzes
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    is_public = true
    AND char_length(title) >= 2
    AND jsonb_array_length(questions) BETWEEN 1 AND 100
    AND char_length(owner_token_hash) >= 32
  );

-- 3. quiz_challenge_attempts policies
CREATE POLICY "Challenge attempts are readable for public quizzes"
  ON public.quiz_challenge_attempts
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.shared_quizzes q
      WHERE q.id = quiz_id AND q.is_public = true
    )
  );

CREATE POLICY "Anyone can submit a valid challenge score"
  ON public.quiz_challenge_attempts
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    score >= 0
    AND total > 0
    AND score <= total
    AND EXISTS (
      SELECT 1 FROM public.shared_quizzes q
      WHERE q.id = quiz_id AND q.is_public = true
    )
  );

-- Note: Keep owner_token_hash write-only in practice by selecting explicit columns in frontend queries:
-- ?select=id,short_code,title,description,subject,language,author_alias,cards,card_count,created_at
