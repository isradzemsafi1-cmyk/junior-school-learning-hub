-- Junior School Learning Hub: learner quiz history
-- Run this once in Supabase Dashboard > SQL Editor.

create table if not exists public.learner_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  grade text not null,
  subject text not null,
  score integer not null check (score >= 0),
  total integer not null check (total > 0),
  percentage numeric(5,2) not null check (percentage >= 0 and percentage <= 100),
  answered integer not null default 0 check (answered >= 0),
  answers jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists learner_quiz_attempts_user_created_idx
  on public.learner_quiz_attempts (user_id, created_at desc);

alter table public.learner_quiz_attempts enable row level security;

drop policy if exists "Learners can read their own quiz attempts" on public.learner_quiz_attempts;
create policy "Learners can read their own quiz attempts"
  on public.learner_quiz_attempts
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Learners can save their own quiz attempts" on public.learner_quiz_attempts;
create policy "Learners can save their own quiz attempts"
  on public.learner_quiz_attempts
  for insert
  to authenticated
  with check (auth.uid() = user_id);

