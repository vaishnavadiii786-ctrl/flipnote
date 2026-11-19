-- FLIPNOTE v3.1 — Private User Sign-In Table (Name + Email)
-- Run this ONCE in Supabase Dashboard -> SQL Editor -> New Query -> Run
-- Visitors can INSERT their own Name + Email, but CANNOT read anyone else's data.
-- Only YOU (the project owner in Supabase Table Editor -> app_users) can view all entries.

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  language text default 'en',
  created_at timestamptz not null default now()
);

alter table public.app_users enable row level security;

drop policy if exists "Allow public user signup insert" on public.app_users;
create policy "Allow public user signup insert"
  on public.app_users
  for insert
  to anon, authenticated
  with check (char_length(trim(full_name)) >= 2 and position('@' in email) > 1);

grant usage on schema public to anon, authenticated;
grant insert on table public.app_users to anon, authenticated;
revoke select, update, delete on table public.app_users from anon, authenticated;
