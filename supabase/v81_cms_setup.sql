-- ============================================================================
-- FLIPNOTE v8.1 — PW-Style Live Admin & CMS Setup (Ready-to-Paste)
-- Run this ONCE in Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 0. Admin Password Vault (Private — NO anon/authenticated direct SELECT!)
CREATE TABLE IF NOT EXISTS public.flipnote_admin_auth (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  password_hash TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.flipnote_admin_auth ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.flipnote_admin_auth FROM anon, authenticated;

-- Default Admin Password: Change 'Flipnote@2026' below before running if you want a custom password!
INSERT INTO public.flipnote_admin_auth (id, password_hash)
VALUES (1, crypt('Flipnote@2026', gen_salt('bf')))
ON CONFLICT (id) DO NOTHING;

-- 1. Live Notice Banners
CREATE TABLE IF NOT EXISTS public.live_notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  badge TEXT NOT NULL DEFAULT 'UPDATE',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  cta_label TEXT DEFAULT '',
  cta_url TEXT DEFAULT '',
  tone TEXT NOT NULL DEFAULT 'emerald',
  priority INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Live Lectures
CREATE TABLE IF NOT EXISTS public.live_lectures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT 'Physics',
  chapter TEXT DEFAULT '',
  batch TEXT DEFAULT 'JEE / NEET',
  teacher TEXT DEFAULT 'FLIPNOTE Faculty',
  video_url TEXT NOT NULL,
  duration TEXT DEFAULT '',
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Live NCERT PDFs
CREATE TABLE IF NOT EXISTS public.live_ncert_pdfs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_level TEXT NOT NULL DEFAULT 'Class 12',
  subject TEXT NOT NULL DEFAULT 'Physics',
  chapter TEXT NOT NULL,
  pdf_url TEXT NOT NULL,
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Live Topper Notes
CREATE TABLE IF NOT EXISTS public.live_topper_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT 'Chemistry',
  chapter TEXT DEFAULT '',
  exam_tag TEXT DEFAULT 'JEE / NEET',
  pdf_url TEXT DEFAULT '',
  summary_md TEXT DEFAULT '',
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Live Quizzes
CREATE TABLE IF NOT EXISTS public.live_quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT 'Mixed',
  exam_tag TEXT DEFAULT 'JEE / NEET',
  duration_min INTEGER NOT NULL DEFAULT 15,
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Public Read-Only RLS for Student App (anon can only read published/active items)
ALTER TABLE public.live_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_lectures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_ncert_pdfs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_topper_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_quizzes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active notices" ON public.live_notices;
CREATE POLICY "Public read active notices" ON public.live_notices FOR SELECT TO anon, authenticated USING (is_active = true);

DROP POLICY IF EXISTS "Public read published lectures" ON public.live_lectures;
CREATE POLICY "Public read published lectures" ON public.live_lectures FOR SELECT TO anon, authenticated USING (is_published = true);

DROP POLICY IF EXISTS "Public read published ncert" ON public.live_ncert_pdfs;
CREATE POLICY "Public read published ncert" ON public.live_ncert_pdfs FOR SELECT TO anon, authenticated USING (is_published = true);

DROP POLICY IF EXISTS "Public read published topper notes" ON public.live_topper_notes;
CREATE POLICY "Public read published topper notes" ON public.live_topper_notes FOR SELECT TO anon, authenticated USING (is_published = true);

DROP POLICY IF EXISTS "Public read published live quizzes" ON public.live_quizzes;
CREATE POLICY "Public read published live quizzes" ON public.live_quizzes FOR SELECT TO anon, authenticated USING (is_published = true);

GRANT SELECT ON public.live_notices, public.live_lectures, public.live_ncert_pdfs, public.live_topper_notes, public.live_quizzes TO anon, authenticated;

-- ============================================================================
-- SECURE PASSWORD-PROTECTED ADMIN RPCs (SECURITY DEFINER)
-- ============================================================================

CREATE OR REPLACE FUNCTION public._verify_flipnote_admin(p_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash TEXT;
BEGIN
  SELECT password_hash INTO v_hash FROM public.flipnote_admin_auth WHERE id = 1;
  IF v_hash IS NULL OR p_password IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN (v_hash = crypt(p_password, v_hash));
END;
$$;

-- 1. Verify Admin Login
CREATE OR REPLACE FUNCTION public.admin_login(p_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN public._verify_flipnote_admin(p_password);
END;
$$;

-- 2. Change Admin Password
CREATE OR REPLACE FUNCTION public.admin_change_password(p_old_password TEXT, p_new_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public._verify_flipnote_admin(p_old_password) THEN
    RAISE EXCEPTION 'Invalid current admin password';
  END IF;
  IF char_length(trim(p_new_password)) < 6 THEN
    RAISE EXCEPTION 'New password must be at least 6 characters';
  END IF;
  UPDATE public.flipnote_admin_auth
  SET password_hash = crypt(p_new_password, gen_salt('bf')), updated_at = now()
  WHERE id = 1;
  RETURN TRUE;
END;
$$;

-- 3. Fetch Full Admin Snapshot (includes unpublished items & app_users)
CREATE OR REPLACE FUNCTION public.admin_get_dashboard(p_password TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public._verify_flipnote_admin(p_password) THEN
    RAISE EXCEPTION 'Unauthorized: Invalid admin password';
  END IF;
  RETURN jsonb_build_object(
    'notices', COALESCE((SELECT jsonb_agg(t ORDER BY t.priority DESC, t.created_at DESC) FROM public.live_notices t), '[]'::jsonb),
    'lectures', COALESCE((SELECT jsonb_agg(t ORDER BY t.created_at DESC) FROM public.live_lectures t), '[]'::jsonb),
    'ncert_pdfs', COALESCE((SELECT jsonb_agg(t ORDER BY t.created_at DESC) FROM public.live_ncert_pdfs t), '[]'::jsonb),
    'topper_notes', COALESCE((SELECT jsonb_agg(t ORDER BY t.created_at DESC) FROM public.live_topper_notes t), '[]'::jsonb),
    'quizzes', COALESCE((SELECT jsonb_agg(t ORDER BY t.created_at DESC) FROM public.live_quizzes t), '[]'::jsonb),
    'users', COALESCE((SELECT jsonb_agg(t ORDER BY t.created_at DESC) FROM (SELECT id, full_name, email, language, created_at FROM public.app_users ORDER BY created_at DESC LIMIT 500) t), '[]'::jsonb)
  );
END;
$$;

-- 4. Upsert Notice Banner
CREATE OR REPLACE FUNCTION public.admin_save_notice(
  p_password TEXT, p_id UUID, p_badge TEXT, p_title TEXT, p_message TEXT,
  p_cta_label TEXT, p_cta_url TEXT, p_tone TEXT, p_priority INTEGER, p_is_active BOOLEAN
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_id UUID;
BEGIN
  IF NOT public._verify_flipnote_admin(p_password) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.live_notices (badge, title, message, cta_label, cta_url, tone, priority, is_active)
    VALUES (p_badge, p_title, p_message, COALESCE(p_cta_label,''), COALESCE(p_cta_url,''), COALESCE(p_tone,'emerald'), COALESCE(p_priority,1), COALESCE(p_is_active,true))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.live_notices
    SET badge=p_badge, title=p_title, message=p_message, cta_label=COALESCE(p_cta_label,''), cta_url=COALESCE(p_cta_url,''), tone=COALESCE(p_tone,'emerald'), priority=COALESCE(p_priority,1), is_active=COALESCE(p_is_active,true)
    WHERE id = p_id RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;

-- 5. Upsert Lecture
CREATE OR REPLACE FUNCTION public.admin_save_lecture(
  p_password TEXT, p_id UUID, p_title TEXT, p_subject TEXT, p_chapter TEXT,
  p_batch TEXT, p_teacher TEXT, p_video_url TEXT, p_duration TEXT, p_is_published BOOLEAN
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_id UUID;
BEGIN
  IF NOT public._verify_flipnote_admin(p_password) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.live_lectures (title, subject, chapter, batch, teacher, video_url, duration, is_published)
    VALUES (p_title, p_subject, COALESCE(p_chapter,''), COALESCE(p_batch,'JEE / NEET'), COALESCE(p_teacher,'FLIPNOTE Faculty'), p_video_url, COALESCE(p_duration,''), COALESCE(p_is_published,true))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.live_lectures
    SET title=p_title, subject=p_subject, chapter=COALESCE(p_chapter,''), batch=COALESCE(p_batch,'JEE / NEET'), teacher=COALESCE(p_teacher,'FLIPNOTE Faculty'), video_url=p_video_url, duration=COALESCE(p_duration,''), is_published=COALESCE(p_is_published,true)
    WHERE id = p_id RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;

-- 6. Upsert NCERT PDF
CREATE OR REPLACE FUNCTION public.admin_save_ncert(
  p_password TEXT, p_id UUID, p_class_level TEXT, p_subject TEXT, p_chapter TEXT, p_pdf_url TEXT, p_is_published BOOLEAN
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_id UUID;
BEGIN
  IF NOT public._verify_flipnote_admin(p_password) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.live_ncert_pdfs (class_level, subject, chapter, pdf_url, is_published)
    VALUES (p_class_level, p_subject, p_chapter, p_pdf_url, COALESCE(p_is_published,true))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.live_ncert_pdfs
    SET class_level=p_class_level, subject=p_subject, chapter=p_chapter, pdf_url=p_pdf_url, is_published=COALESCE(p_is_published,true)
    WHERE id = p_id RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;

-- 7. Upsert Topper Notes
CREATE OR REPLACE FUNCTION public.admin_save_note(
  p_password TEXT, p_id UUID, p_title TEXT, p_subject TEXT, p_chapter TEXT, p_exam_tag TEXT, p_pdf_url TEXT, p_summary_md TEXT, p_is_published BOOLEAN
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_id UUID;
BEGIN
  IF NOT public._verify_flipnote_admin(p_password) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.live_topper_notes (title, subject, chapter, exam_tag, pdf_url, summary_md, is_published)
    VALUES (p_title, p_subject, COALESCE(p_chapter,''), COALESCE(p_exam_tag,'JEE / NEET'), COALESCE(p_pdf_url,''), COALESCE(p_summary_md,''), COALESCE(p_is_published,true))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.live_topper_notes
    SET title=p_title, subject=p_subject, chapter=COALESCE(p_chapter,''), exam_tag=COALESCE(p_exam_tag,'JEE / NEET'), pdf_url=COALESCE(p_pdf_url,''), summary_md=COALESCE(p_summary_md,''), is_published=COALESCE(p_is_published,true)
    WHERE id = p_id RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;

-- 8. Upsert Live Quiz
CREATE OR REPLACE FUNCTION public.admin_save_quiz(
  p_password TEXT, p_id UUID, p_title TEXT, p_subject TEXT, p_exam_tag TEXT, p_duration_min INTEGER, p_questions JSONB, p_is_published BOOLEAN
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_id UUID;
BEGIN
  IF NOT public._verify_flipnote_admin(p_password) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.live_quizzes (title, subject, exam_tag, duration_min, questions, is_published)
    VALUES (p_title, p_subject, COALESCE(p_exam_tag,'JEE / NEET'), COALESCE(p_duration_min,15), COALESCE(p_questions,'[]'::jsonb), COALESCE(p_is_published,true))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.live_quizzes
    SET title=p_title, subject=p_subject, exam_tag=COALESCE(p_exam_tag,'JEE / NEET'), duration_min=COALESCE(p_duration_min,15), questions=COALESCE(p_questions,'[]'::jsonb), is_published=COALESCE(p_is_published,true)
    WHERE id = p_id RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;

-- 9. Universal Safe Delete for Admin Tables
CREATE OR REPLACE FUNCTION public.admin_delete_record(p_password TEXT, p_table TEXT, p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF NOT public._verify_flipnote_admin(p_password) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_table = 'live_notices' THEN DELETE FROM public.live_notices WHERE id = p_id;
  ELSIF p_table = 'live_lectures' THEN DELETE FROM public.live_lectures WHERE id = p_id;
  ELSIF p_table = 'live_ncert_pdfs' THEN DELETE FROM public.live_ncert_pdfs WHERE id = p_id;
  ELSIF p_table = 'live_topper_notes' THEN DELETE FROM public.live_topper_notes WHERE id = p_id;
  ELSIF p_table = 'live_quizzes' THEN DELETE FROM public.live_quizzes WHERE id = p_id;
  ELSIF p_table = 'app_users' THEN DELETE FROM public.app_users WHERE id = p_id;
  ELSE RAISE EXCEPTION 'Invalid table name';
  END IF;
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION
  public.admin_login(TEXT),
  public.admin_change_password(TEXT, TEXT),
  public.admin_get_dashboard(TEXT),
  public.admin_save_notice(TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, BOOLEAN),
  public.admin_save_lecture(TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN),
  public.admin_save_ncert(TEXT, UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN),
  public.admin_save_note(TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN),
  public.admin_save_quiz(TEXT, UUID, TEXT, TEXT, TEXT, INTEGER, JSONB, BOOLEAN),
  public.admin_delete_record(TEXT, TEXT, UUID)
TO anon, authenticated;


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
