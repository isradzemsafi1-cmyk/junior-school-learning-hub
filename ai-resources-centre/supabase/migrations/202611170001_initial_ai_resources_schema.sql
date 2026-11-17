create extension if not exists pgcrypto;
create schema if not exists private;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  county text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.school_memberships (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('school_admin','teacher','learner')),
  class_label text,
  created_at timestamptz not null default now(),
  unique (school_id,user_id)
);

create table if not exists public.learning_resources (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  grade text not null check (grade in ('Grade 7','Grade 8','Grade 9')),
  learning_area text not null,
  strand text,
  sub_strand text,
  title text not null,
  description text,
  resource_type text not null default 'notes',
  content text,
  storage_path text,
  status text not null default 'draft' check (status in ('draft','review','published','archived')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.generated_documents (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  document_type text not null,
  title text not null,
  grade text not null check (grade in ('Grade 7','Grade 8','Grade 9')),
  learning_area text not null,
  term text,
  academic_year integer,
  document_content text not null,
  status text not null default 'draft' check (status in ('draft','submitted','approved','returned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete set null,
  title text not null,
  grade text not null check (grade in ('Grade 7','Grade 8','Grade 9')),
  learning_area text not null,
  questions jsonb not null default '[]'::jsonb,
  published boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  learner_id uuid not null references auth.users(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  score numeric,
  total_marks numeric,
  completed_at timestamptz not null default now()
);

create index if not exists idx_memberships_user on public.school_memberships(user_id);
create index if not exists idx_memberships_school on public.school_memberships(school_id);
create index if not exists idx_resources_school_grade on public.learning_resources(school_id,grade,learning_area);
create index if not exists idx_documents_owner on public.generated_documents(owner_id,created_at desc);
create index if not exists idx_attempts_learner on public.quiz_attempts(learner_id,completed_at desc);

alter table public.profiles enable row level security;
alter table public.schools enable row level security;
alter table public.school_memberships enable row level security;
alter table public.learning_resources enable row level security;
alter table public.generated_documents enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_attempts enable row level security;

create policy "Users read own profile" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "Users insert own profile" on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy "Users update own profile" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "Members read their schools" on public.schools for select to authenticated using (
  exists (select 1 from public.school_memberships m where m.school_id = id and m.user_id = (select auth.uid()))
  or created_by = (select auth.uid())
);
create policy "Authenticated users create schools" on public.schools for insert to authenticated with check (created_by = (select auth.uid()));

create policy "Users read own memberships" on public.school_memberships for select to authenticated using (user_id = (select auth.uid()));
create policy "School creators add initial membership" on public.school_memberships for insert to authenticated with check (
  user_id = (select auth.uid()) and exists (select 1 from public.schools s where s.id = school_id and s.created_by = (select auth.uid()))
);

create policy "Read published resources or own school resources" on public.learning_resources for select to authenticated using (
  status = 'published' and school_id is null
  or exists (select 1 from public.school_memberships m where m.school_id = learning_resources.school_id and m.user_id = (select auth.uid()))
);
create policy "Teachers create resources in their school" on public.learning_resources for insert to authenticated with check (
  created_by = (select auth.uid()) and exists (select 1 from public.school_memberships m where m.school_id = learning_resources.school_id and m.user_id = (select auth.uid()) and m.role in ('teacher','school_admin'))
);
create policy "Teachers update own school resources" on public.learning_resources for update to authenticated using (
  exists (select 1 from public.school_memberships m where m.school_id = learning_resources.school_id and m.user_id = (select auth.uid()) and m.role in ('teacher','school_admin'))
) with check (
  exists (select 1 from public.school_memberships m where m.school_id = learning_resources.school_id and m.user_id = (select auth.uid()) and m.role in ('teacher','school_admin'))
);

create policy "Users read own generated documents" on public.generated_documents for select to authenticated using (
  owner_id = (select auth.uid()) or exists (select 1 from public.school_memberships m where m.school_id = generated_documents.school_id and m.user_id = (select auth.uid()) and m.role = 'school_admin')
);
create policy "Users create own generated documents" on public.generated_documents for insert to authenticated with check (
  owner_id = (select auth.uid()) and (school_id is null or exists (select 1 from public.school_memberships m where m.school_id = generated_documents.school_id and m.user_id = (select auth.uid())))
);
create policy "Users update own generated documents" on public.generated_documents for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "Read published quizzes or own school quizzes" on public.quizzes for select to authenticated using (
  published = true and school_id is null
  or owner_id = (select auth.uid())
  or exists (select 1 from public.school_memberships m where m.school_id = quizzes.school_id and m.user_id = (select auth.uid()))
);
create policy "Teachers create quizzes" on public.quizzes for insert to authenticated with check (
  owner_id = (select auth.uid()) and exists (select 1 from public.school_memberships m where m.school_id = quizzes.school_id and m.user_id = (select auth.uid()) and m.role in ('teacher','school_admin'))
);
create policy "Learners manage own quiz attempts" on public.quiz_attempts for all to authenticated using (learner_id = (select auth.uid())) with check (learner_id = (select auth.uid()));

grant usage on schema public to authenticated;
grant select,insert,update on public.profiles to authenticated;
grant select,insert on public.schools to authenticated;
grant select,insert on public.school_memberships to authenticated;
grant select,insert,update on public.learning_resources to authenticated;
grant select,insert,update on public.generated_documents to authenticated;
grant select,insert on public.quizzes to authenticated;
grant select,insert on public.quiz_attempts to authenticated;
