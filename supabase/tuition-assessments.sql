-- Tuition Centre online assessments: authoring, learner attempts and results
-- Run after the existing tuition-centre schema in Supabase SQL Editor.

create table if not exists public.tuition_assessments (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 140),
  grade integer not null check (grade in (7,8,9)),
  subject text not null,
  instructions text not null default '',
  duration_minutes integer not null default 30 check (duration_minutes between 5 and 180),
  questions jsonb not null check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) >= 1),
  published boolean not null default false,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.tuition_assessments enable row level security;

drop policy if exists "tuition assessments teachers manage" on public.tuition_assessments;
create policy "tuition assessments teachers manage" on public.tuition_assessments
for all to authenticated
using (exists(select 1 from public.tuition_profiles p where p.id=auth.uid() and p.role in ('teacher','admin')))
with check (exists(select 1 from public.tuition_profiles p where p.id=auth.uid() and p.role in ('teacher','admin')));

drop policy if exists "learners read published assessments for own grade" on public.tuition_assessments;
create policy "learners read published assessments for own grade" on public.tuition_assessments
for select to authenticated
using (published=true and exists(select 1 from public.tuition_profiles p where p.id=auth.uid() and p.role='learner' and p.grade=tuition_assessments.grade));

grant select,insert,update,delete on public.tuition_assessments to authenticated;

create table if not exists public.tuition_assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.tuition_assessments(id) on delete cascade,
  learner_id uuid not null references auth.users(id) on delete cascade,
  answers jsonb not null default '[]'::jsonb,
  score integer not null check (score >= 0),
  total_questions integer not null check (total_questions > 0),
  percentage numeric(5,2) not null check (percentage between 0 and 100),
  submitted_at timestamptz not null default now(),
  unique(assessment_id, learner_id, submitted_at)
);
alter table public.tuition_assessment_attempts enable row level security;

drop policy if exists "learners create own assessment attempts" on public.tuition_assessment_attempts;
create policy "learners create own assessment attempts" on public.tuition_assessment_attempts
for insert to authenticated with check (learner_id=auth.uid() and exists (
 select 1 from public.tuition_profiles p join public.tuition_assessments a on a.grade=p.grade
 where p.id=auth.uid() and p.role='learner' and a.id=assessment_id and a.published=true
));
drop policy if exists "learners read own assessment attempts" on public.tuition_assessment_attempts;
create policy "learners read own assessment attempts" on public.tuition_assessment_attempts
for select to authenticated using (learner_id=auth.uid());
drop policy if exists "teachers read assessment attempts" on public.tuition_assessment_attempts;
create policy "teachers read assessment attempts" on public.tuition_assessment_attempts
for select to authenticated using (exists(select 1 from public.tuition_profiles p where p.id=auth.uid() and p.role in ('teacher','admin')));
grant select,insert on public.tuition_assessment_attempts to authenticated;
