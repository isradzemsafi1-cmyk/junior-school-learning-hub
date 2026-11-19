-- EduGames World foundation — additive migration only.
-- Apply only after reviewing in the dedicated project / approved migration workflow.
create table if not exists public.edugames_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  xp_total integer not null default 0 check (xp_total >= 0),
  stars_total integer not null default 0 check (stars_total >= 0),
  missions_completed integer not null default 0 check (missions_completed >= 0),
  updated_at timestamptz not null default now()
);
create table if not exists public.edugames_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  grade smallint not null check (grade between 1 and 12),
  world_id text not null check (world_id in ('word','science','geo','code','farm','money','history','eco','body','creative','quiz','invent','daily')),
  question_text text not null,
  is_correct boolean not null,
  xp_earned integer not null default 0 check (xp_earned between 0 and 10),
  created_at timestamptz not null default now()
);
create index if not exists edugames_attempts_user_created_idx on public.edugames_attempts(user_id, created_at desc);
alter table public.edugames_profiles enable row level security;
alter table public.edugames_attempts enable row level security;
drop policy if exists "Learners read own EduGames profile" on public.edugames_profiles;
create policy "Learners read own EduGames profile" on public.edugames_profiles for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Learners insert own EduGames profile" on public.edugames_profiles;
create policy "Learners insert own EduGames profile" on public.edugames_profiles for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Learners update own EduGames profile" on public.edugames_profiles;
create policy "Learners update own EduGames profile" on public.edugames_profiles for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Learners read own EduGames attempts" on public.edugames_attempts;
create policy "Learners read own EduGames attempts" on public.edugames_attempts for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Learners insert own EduGames attempts" on public.edugames_attempts;
create policy "Learners insert own EduGames attempts" on public.edugames_attempts for insert to authenticated with check (auth.uid() = user_id);
