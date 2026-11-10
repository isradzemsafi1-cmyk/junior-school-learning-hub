-- DIGITAL SCHOOL CENTRE: starter schema sketch for Supabase/PostgreSQL
-- This is a foundation draft, NOT a complete production migration.
-- Have a qualified engineer review access policies, auth flows, retention,
-- backups and Kenyan data-protection obligations before real learner data.

create extension if not exists pgcrypto;

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  status text not null default 'trial' check (status in ('trial','active','suspended','closed')),
  created_at timestamptz not null default now()
);

create table if not exists public.school_memberships (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('school_owner','administrator','headteacher','deputy','teacher','registrar','bursar','parent','learner')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(school_id,user_id)
);

create or replace function public.is_school_member(target_school uuid)
returns boolean language sql stable security definer set search_path=public
as $$
  select exists (
    select 1 from public.school_memberships m
    where m.school_id=target_school and m.user_id=auth.uid() and m.active=true
  );
$$;

create table if not exists public.academic_years (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  starts_on date,
  ends_on date,
  active boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.school_grades (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  level_group text,
  sort_order integer default 0,
  unique(school_id,name)
);

create table if not exists public.school_streams (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  grade_id uuid not null references public.school_grades(id) on delete cascade,
  name text not null,
  unique(grade_id,name)
);

create table if not exists public.learning_areas (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  curriculum_version text,
  unique(school_id,name,curriculum_version)
);

create table if not exists public.staff_profiles (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  staff_number text,
  full_name text not null,
  job_title text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(school_id,staff_number)
);

create table if not exists public.learners (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  admission_number text not null,
  full_name text not null,
  grade_id uuid references public.school_grades(id) on delete set null,
  stream_id uuid references public.school_streams(id) on delete set null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  unique(school_id,admission_number)
);

create table if not exists public.teacher_daily_occurrences (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  academic_year_id uuid references public.academic_years(id) on delete set null,
  occurrence_date date not null,
  teacher_id uuid not null references public.staff_profiles(id) on delete restrict,
  grade_id uuid references public.school_grades(id) on delete set null,
  stream_id uuid references public.school_streams(id) on delete set null,
  learning_area_id uuid references public.learning_areas(id) on delete set null,
  lesson_period text,
  attendance_status text,
  category text not null default 'normal_lesson',
  work_covered text not null,
  observation text,
  action_taken text,
  follow_up_status text not null default 'not_required'
    check (follow_up_status in ('not_required','pending','in_progress','completed')),
  follow_up_due date,
  reviewer_remarks text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_occ_school_date
  on public.teacher_daily_occurrences(school_id,occurrence_date desc);
create index if not exists idx_occ_teacher_date
  on public.teacher_daily_occurrences(teacher_id,occurrence_date desc);

alter table public.schools enable row level security;
alter table public.school_memberships enable row level security;
alter table public.academic_years enable row level security;
alter table public.school_grades enable row level security;
alter table public.school_streams enable row level security;
alter table public.learning_areas enable row level security;
alter table public.staff_profiles enable row level security;
alter table public.learners enable row level security;
alter table public.teacher_daily_occurrences enable row level security;

-- Starter read policies. Membership management and write policies must be
-- implemented through secure onboarding/admin functions; do not allow users
-- to self-assign privileged roles.
create policy "members read own school" on public.schools
for select using (public.is_school_member(id));
create policy "members read memberships" on public.school_memberships
for select using (public.is_school_member(school_id));
create policy "members read academic years" on public.academic_years
for select using (public.is_school_member(school_id));
create policy "members read grades" on public.school_grades
for select using (public.is_school_member(school_id));
create policy "members read streams" on public.school_streams
for select using (public.is_school_member(school_id));
create policy "members read learning areas" on public.learning_areas
for select using (public.is_school_member(school_id));
create policy "members read staff" on public.staff_profiles
for select using (public.is_school_member(school_id));
create policy "members read learners" on public.learners
for select using (public.is_school_member(school_id));
create policy "members read occurrence" on public.teacher_daily_occurrences
for select using (public.is_school_member(school_id));

-- IMPORTANT: These basic read policies do not implement role-level access,
-- teacher assignment scoping, parent-to-learner scoping or privileged writes.
-- Add those before production use. Consider a dedicated restricted case table
-- for safeguarding/medical/disciplinary information.
