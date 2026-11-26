-- ============================================================================
-- FLIPNOTE v8.1 — Real Global Student Leaderboard Setup
-- Run this in Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.student_leaderboard (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_key TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL CHECK (char_length(trim(full_name)) >= 2 AND char_length(full_name) <= 80),
  exam TEXT NOT NULL DEFAULT 'Student' CHECK (char_length(exam) <= 40),
  xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0 AND xp <= 1000000),
  streak INTEGER NOT NULL DEFAULT 0 CHECK (streak >= 0 AND streak <= 3650),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_leaderboard_xp ON public.student_leaderboard (xp DESC, streak DESC);

ALTER TABLE public.student_leaderboard ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read real student leaderboard" ON public.student_leaderboard;
CREATE POLICY "Anyone can read real student leaderboard"
  ON public.student_leaderboard
  FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON public.student_leaderboard TO anon, authenticated;

-- Secure Upsert RPC (prevents exposing student_key or overwriting others)
CREATE OR REPLACE FUNCTION public.upsert_student_leaderboard(
  p_student_key TEXT,
  p_full_name TEXT,
  p_exam TEXT,
  p_xp INTEGER,
  p_streak INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF char_length(trim(COALESCE(p_student_key, ''))) < 6 THEN
    RAISE EXCEPTION 'Invalid student key';
  END IF;
  IF char_length(trim(COALESCE(p_full_name, ''))) < 2 THEN
    RAISE EXCEPTION 'Invalid student name';
  END IF;

  INSERT INTO public.student_leaderboard (student_key, full_name, exam, xp, streak, updated_at)
  VALUES (
    trim(p_student_key),
    left(trim(p_full_name), 80),
    COALESCE(NULLIF(trim(p_exam), ''), 'Student'),
    GREATEST(0, LEAST(COALESCE(p_xp, 0), 1000000)),
    GREATEST(0, LEAST(COALESCE(p_streak, 0), 3650)),
    now()
  )
  ON CONFLICT (student_key) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    exam = EXCLUDED.exam,
    xp = EXCLUDED.xp,
    streak = EXCLUDED.streak,
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_student_leaderboard(TEXT, TEXT, TEXT, INTEGER, INTEGER) TO anon, authenticated;
