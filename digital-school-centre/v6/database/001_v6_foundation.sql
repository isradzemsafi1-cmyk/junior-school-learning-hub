-- DIGITAL SCHOOL CENTRE V6
-- Phase 1 foundation schema for Supabase/PostgreSQL.
-- Review and deploy to a NEW development Supabase project first.
-- This is not a complete production migration: privileged writes, onboarding RPCs,
-- parent/teacher assignment scoping, retention automation and security testing remain required.

create extension if not exists pgcrypto;

-- Every school is an isolated tenant. Never trust a client-supplied school_id alone.
create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  display_name text not null,
  slug text not null unique,
  school_type text not null default 'private',
  school_model text not null default 'day',
  country_code char(2) not null default 'KE',
  county text,
  sub_county text,
  registration_number text,
  status text not null default 'trial'
    check (status in ('trial','active','suspended','closed')),
  timezone text not null default 'Africa/Nairobi',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.school_memberships (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in (
    'school_owner','director','headteacher','deputy_headteacher','dos',
    'administrator','registrar','teacher','class_teacher','bursar',
    'accountant','librarian','transport_manager','storekeeper',
    'parent','learner','auditor'
  )),
  campus_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (school_id,user_id)
);

create or replace function public.is_school_member(target_school uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.school_memberships m
    where m.school_id = target_school
      and m.user_id = auth.uid()
      and m.active = true
  );
$$;

create or replace function public.has_school_role(target_school uuid, allowed_roles text[])
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.school_memberships m
    where m.school_id = target_school
      and m.user_id = auth.uid()
      and m.active = true
      and m.role = any(allowed_roles)
  );
$$;

create table if not exists public.campuses (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  code text,
  address text,
  active boolean not null default true,
  unique (school_id, code),
  unique (school_id, name)
);

create table if not exists public.academic_years (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  starts_on date,
  ends_on date,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  unique (school_id,name),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create table if not exists public.academic_terms (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  name text not null,
  term_number smallint,
  starts_on date,
  ends_on date,
  unique (academic_year_id,name),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create table if not exists public.education_stages (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  sort_order smallint not null,
  curriculum_family text not null default 'CBC_CBE'
);

insert into public.education_stages(code,name,sort_order,curriculum_family) values
 ('PRE_PRIMARY','Pre-primary / Early Years',1,'CBC_CBE'),
 ('LOWER_PRIMARY','Lower Primary',2,'CBC_CBE'),
 ('UPPER_PRIMARY','Upper Primary',3,'CBC_CBE'),
 ('JUNIOR_SCHOOL','Junior School',4,'CBC_CBE'),
 ('SENIOR_SCHOOL','Senior School',5,'CBC_CBE'),
 ('STAGE_BASED','Stage-based / SNE',6,'STAGE_BASED'),
 ('ALTERNATIVE','Alternative curriculum',7,'CONFIGURABLE')
on conflict (code) do nothing;

create table if not exists public.school_grades (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  stage_id uuid not null references public.education_stages(id),
  name text not null,
  sort_order smallint not null default 0,
  active boolean not null default true,
  unique (school_id,name)
);

create table if not exists public.school_streams (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  grade_id uuid not null references public.school_grades(id) on delete cascade,
  name text not null,
  capacity integer,
  active boolean not null default true,
  unique (grade_id,name),
  check (capacity is null or capacity > 0)
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  campus_id uuid references public.campuses(id) on delete set null,
  name text not null,
  room_type text not null default 'classroom',
  capacity integer,
  active boolean not null default true,
  unique (school_id,name),
  check (capacity is null or capacity > 0)
);

create table if not exists public.curriculum_versions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  curriculum_name text not null,
  version_label text not null,
  stage_id uuid references public.education_stages(id),
  effective_from date,
  effective_to date,
  source_reference text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (school_id,curriculum_name,version_label)
);

create table if not exists public.learning_areas (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  curriculum_version_id uuid references public.curriculum_versions(id) on delete set null,
  code text,
  name text not null,
  stage_id uuid references public.education_stages(id),
  active boolean not null default true,
  unique (school_id,code),
  unique (school_id,name,curriculum_version_id)
);

create table if not exists public.staff_profiles (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  campus_id uuid references public.campuses(id) on delete set null,
  auth_user_id uuid references auth.users(id) on delete set null,
  staff_number text,
  full_name text not null,
  email text,
  phone text,
  job_title text,
  employment_status text not null default 'active',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (school_id,staff_number)
);

create table if not exists public.teacher_learning_areas (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  teacher_id uuid not null references public.staff_profiles(id) on delete cascade,
  learning_area_id uuid not null references public.learning_areas(id) on delete cascade,
  qualified boolean not null default true,
  unique (teacher_id,learning_area_id)
);

create table if not exists public.learners (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  campus_id uuid references public.campuses(id) on delete set null,
  admission_number text not null,
  full_name text not null,
  date_of_birth date,
  gender text,
  grade_id uuid references public.school_grades(id) on delete set null,
  stream_id uuid references public.school_streams(id) on delete set null,
  enrolment_status text not null default 'active'
    check (enrolment_status in ('applicant','active','transferred','graduated','withdrawn','alumni')),
  admission_date date,
  created_at timestamptz not null default now(),
  unique (school_id,admission_number)
);

create table if not exists public.guardians (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  full_name text not null,
  phone text,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists public.learner_guardians (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  learner_id uuid not null references public.learners(id) on delete cascade,
  guardian_id uuid not null references public.guardians(id) on delete cascade,
  relationship text,
  is_primary boolean not null default false,
  can_receive_academic_updates boolean not null default true,
  can_receive_finance_updates boolean not null default false,
  unique (learner_id,guardian_id)
);

create table if not exists public.assessment_profiles (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  profile_code text not null,
  name text not null,
  curriculum_family text not null,
  version_label text not null,
  is_official_reference boolean not null default false,
  source_url text,
  active boolean not null default true,
  unique (school_id,profile_code,version_label)
);

create table if not exists public.assessment_grade_bands (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.assessment_profiles(id) on delete cascade,
  band_code text not null,
  performance_level text not null,
  min_percent numeric(5,2) not null,
  max_percent numeric(5,2) not null,
  points numeric(6,2),
  sort_order smallint not null,
  unique (profile_id,band_code),
  check (min_percent >= 0 and max_percent <= 100 and min_percent <= max_percent)
);

-- Platform reference profile: clone/attach this reference when a school enables it.
create table if not exists public.platform_assessment_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_code text not null,
  name text not null,
  version_label text not null,
  source_url text,
  active boolean not null default true,
  unique (profile_code,version_label)
);
create table if not exists public.platform_assessment_bands (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.platform_assessment_profiles(id) on delete cascade,
  band_code text not null,
  performance_level text not null,
  min_percent numeric(5,2) not null,
  max_percent numeric(5,2) not null,
  points numeric(6,2) not null,
  sort_order smallint not null,
  unique (profile_id,band_code),
  check (min_percent >= 0 and max_percent <= 100 and min_percent <= max_percent)
);

insert into public.platform_assessment_profiles(profile_code,name,version_label,source_url)
values ('KJSEA','Kenya Junior School Education Assessment','2025','https://www.knec.ac.ke/wp-content/uploads/2026/02/KJSEA-REGULATIONS.pdf')
on conflict (profile_code,version_label) do nothing;

insert into public.platform_assessment_bands(profile_id,band_code,performance_level,min_percent,max_percent,points,sort_order)
select p.id,v.band_code,v.performance_level,v.min_percent,v.max_percent,v.points,v.sort_order
from public.platform_assessment_profiles p
cross join (values
 ('EE1','Exceeding Expectation',90::numeric,100::numeric,8::numeric,1),
 ('EE2','Exceeding Expectation',75,89,7,2),
 ('ME1','Meeting Expectation',58,74,6,3),
 ('ME2','Meeting Expectation',41,57,5,4),
 ('AE1','Approaching Expectation',31,40,4,5),
 ('AE2','Approaching Expectation',21,30,3,6),
 ('BE1','Below Expectation',11,20,2,7),
 ('BE2','Below Expectation',0,10,1,8)
) as v(band_code,performance_level,min_percent,max_percent,points,sort_order)
where p.profile_code='KJSEA' and p.version_label='2025'
on conflict (profile_id,band_code) do nothing;

create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  academic_year_id uuid references public.academic_years(id) on delete set null,
  term_id uuid references public.academic_terms(id) on delete set null,
  grade_id uuid references public.school_grades(id) on delete set null,
  title text not null,
  assessment_type text not null default 'school_based',
  status text not null default 'draft'
    check (status in ('draft','open','marking','moderation','approved','locked','archived')),
  profile_id uuid references public.assessment_profiles(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  locked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.assessment_results (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  learner_id uuid not null references public.learners(id) on delete cascade,
  learning_area_id uuid not null references public.learning_areas(id) on delete restrict,
  raw_score numeric(8,2),
  max_score numeric(8,2) not null,
  percentage numeric(5,2),
  performance_code text,
  points numeric(6,2),
  teacher_comment text,
  entered_by uuid references auth.users(id) on delete set null,
  moderated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (assessment_id,learner_id,learning_area_id),
  check (max_score > 0),
  check (raw_score is null or (raw_score >= 0 and raw_score <= max_score))
);

create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  school_id uuid references public.schools(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_table text not null,
  entity_id text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_membership_user_school on public.school_memberships(user_id,school_id) where active;
create index if not exists idx_learners_school_grade on public.learners(school_id,grade_id,stream_id);
create index if not exists idx_staff_school on public.staff_profiles(school_id,active);
create index if not exists idx_assessment_school_status on public.assessments(school_id,status);
create index if not exists idx_results_assessment on public.assessment_results(school_id,assessment_id);
create index if not exists idx_audit_school_created on public.audit_events(school_id,created_at desc);

-- RLS: member read access is the initial baseline. More restrictive role/assignment
-- policies must replace these broad membership reads before real learner data is loaded.
alter table public.schools enable row level security;
alter table public.school_memberships enable row level security;
alter table public.campuses enable row level security;
alter table public.academic_years enable row level security;
alter table public.academic_terms enable row level security;
alter table public.school_grades enable row level security;
alter table public.school_streams enable row level security;
alter table public.rooms enable row level security;
alter table public.curriculum_versions enable row level security;
alter table public.learning_areas enable row level security;
alter table public.staff_profiles enable row level security;
alter table public.teacher_learning_areas enable row level security;
alter table public.learners enable row level security;
alter table public.guardians enable row level security;
alter table public.learner_guardians enable row level security;
alter table public.assessment_profiles enable row level security;
alter table public.assessments enable row level security;
alter table public.assessment_results enable row level security;
alter table public.audit_events enable row level security;

create policy "school members read school" on public.schools
for select using (public.is_school_member(id));
create policy "school members read memberships" on public.school_memberships
for select using (public.is_school_member(school_id));
create policy "school members read campuses" on public.campuses
for select using (public.is_school_member(school_id));
create policy "school members read years" on public.academic_years
for select using (public.is_school_member(school_id));
create policy "school members read terms" on public.academic_terms
for select using (public.is_school_member(school_id));
create policy "school members read grades" on public.school_grades
for select using (public.is_school_member(school_id));
create policy "school members read streams" on public.school_streams
for select using (public.is_school_member(school_id));
create policy "school members read rooms" on public.rooms
for select using (public.is_school_member(school_id));
create policy "school members read curriculum" on public.curriculum_versions
for select using (public.is_school_member(school_id));
create policy "school members read learning areas" on public.learning_areas
for select using (public.is_school_member(school_id));
create policy "school members read staff" on public.staff_profiles
for select using (public.is_school_member(school_id));
create policy "school members read teacher areas" on public.teacher_learning_areas
for select using (public.is_school_member(school_id));
create policy "school members read learners" on public.learners
for select using (public.is_school_member(school_id));
create policy "school members read guardians" on public.guardians
for select using (public.is_school_member(school_id));
create policy "school members read learner guardians" on public.learner_guardians
for select using (public.is_school_member(school_id));
create policy "school members read assessment profiles" on public.assessment_profiles
for select using (public.is_school_member(school_id));
create policy "school members read assessments" on public.assessments
for select using (public.is_school_member(school_id));
create policy "school members read results" on public.assessment_results
for select using (public.is_school_member(school_id));
create policy "school leaders read audit" on public.audit_events
for select using (public.has_school_role(school_id,array['school_owner','director','headteacher','auditor']));

-- No client write policies are granted in this foundation migration.
-- Implement audited, server-side onboarding and write operations after role design.
-- Do not grant authenticated users direct INSERT/UPDATE on school_memberships.
