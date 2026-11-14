-- QUIZ LEAGUE ARENA: curriculum-aware automatic quiz generator
-- Run AFTER the existing supabase-quiz-league-arena.sql migration.
-- This migration does not change the existing PIN/game/answer scoring functions.

alter table public.qla_quizzes
  add column if not exists academic_year text,
  add column if not exists term text,
  add column if not exists strand text,
  add column if not exists sub_strand text,
  add column if not exists generation_source text not null default 'teacher_authored';

create table if not exists public.qla_curriculum_topics (
  id uuid primary key default gen_random_uuid(),
  grade text not null check (grade in ('Grade 7','Grade 8','Grade 9')),
  learning_area text not null check (learning_area in (
    'Mathematics','English','Kiswahili','Integrated Science','Social Studies',
    'CRE','Agriculture','Pre-Technical Studies','Creative Arts and Sports'
  )),
  academic_year text not null,
  term text not null check (term in ('Term 1','Term 2','Term 3')),
  strand text not null,
  sub_strand text not null,
  learning_outcomes text not null,
  curriculum_notes text not null,
  source_reference text not null default '',
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(grade,learning_area,academic_year,term,strand,sub_strand)
);

create index if not exists qla_curriculum_topics_lookup
  on public.qla_curriculum_topics(grade,learning_area,academic_year,term,strand,sub_strand)
  where is_active=true;

alter table public.qla_curriculum_topics enable row level security;

drop policy if exists qla_curriculum_topics_teacher_read on public.qla_curriculum_topics;
drop policy if exists qla_curriculum_topics_teacher_manage on public.qla_curriculum_topics;

create policy qla_curriculum_topics_teacher_read
  on public.qla_curriculum_topics for select to authenticated
  using (public.is_tuition_teacher());

create policy qla_curriculum_topics_teacher_manage
  on public.qla_curriculum_topics for all to authenticated
  using (public.is_tuition_teacher())
  with check (public.is_tuition_teacher());

grant select,insert,update,delete on public.qla_curriculum_topics to authenticated;

-- Teachers must load curriculum metadata before generating a quiz.
-- A topic row is one grade + learning area + academic year + term + strand + sub-strand.
-- Store concise, verified outcomes and curriculum scope notes; do not invent missing syllabus content.
