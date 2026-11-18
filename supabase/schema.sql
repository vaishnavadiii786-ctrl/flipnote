-- FLIPNOTE Supabase PostgreSQL Schema
-- Run this in your Supabase SQL Editor before applying policies.sql.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Publicly shared study sets (explicitly published by users)
CREATE TABLE IF NOT EXISTS public.public_study_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  short_code TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(5), 'hex'),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 2 AND 160),
  description TEXT DEFAULT '' CHECK (char_length(description) <= 500),
  subject TEXT DEFAULT 'General' CHECK (char_length(subject) <= 60),
  language TEXT NOT NULL DEFAULT 'en' CHECK (char_length(language) <= 12),
  author_alias TEXT DEFAULT 'Anonymous Learner' CHECK (char_length(author_alias) <= 60),
  cards JSONB NOT NULL CHECK (jsonb_typeof(cards) = 'array' AND jsonb_array_length(cards) BETWEEN 1 AND 200),
  card_count INTEGER GENERATED ALWAYS AS (jsonb_array_length(cards)) STORED,
  is_public BOOLEAN NOT NULL DEFAULT true,
  owner_token_hash TEXT NOT NULL, -- SHA-256 of client-generated edit/delete token (never expose raw token)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_public_study_sets_created ON public.public_study_sets (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_public_study_sets_language ON public.public_study_sets (language);
CREATE INDEX IF NOT EXISTS idx_public_study_sets_short_code ON public.public_study_sets (short_code);

-- 2. Publicly shared MCQ quiz challenges
CREATE TABLE IF NOT EXISTS public.shared_quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  short_code TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(5), 'hex'),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 2 AND 160),
  subject TEXT DEFAULT 'General' CHECK (char_length(subject) <= 60),
  language TEXT NOT NULL DEFAULT 'en' CHECK (char_length(language) <= 12),
  author_alias TEXT DEFAULT 'Anonymous Learner' CHECK (char_length(author_alias) <= 60),
  questions JSONB NOT NULL CHECK (jsonb_typeof(questions) = 'array' AND jsonb_array_length(questions) BETWEEN 1 AND 100),
  question_count INTEGER GENERATED ALWAYS AS (jsonb_array_length(questions)) STORED,
  is_public BOOLEAN NOT NULL DEFAULT true,
  owner_token_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shared_quizzes_created ON public.shared_quizzes (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shared_quizzes_short_code ON public.shared_quizzes (short_code);

-- 3. Optional Quiz Challenge Leaderboard (anonymous alias + score only, no PII)
CREATE TABLE IF NOT EXISTS public.quiz_challenge_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES public.shared_quizzes(id) ON DELETE CASCADE,
  participant_alias TEXT NOT NULL DEFAULT 'Learner' CHECK (char_length(participant_alias) BETWEEN 1 AND 40),
  score INTEGER NOT NULL CHECK (score >= 0),
  total INTEGER NOT NULL CHECK (total > 0 AND score <= total),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz_id ON public.quiz_challenge_attempts (quiz_id, score DESC, created_at ASC);
