-- DIGITAL SCHOOL CENTRE V6.3: timetable planning + published schedules.
-- Apply after migrations 001, 002 and 003 in a development Supabase project.
-- These tables store requirements and generated schedule versions; generation itself
-- runs in a trusted scheduling service in the production implementation.

create table if not exists public.timetable_templates (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null references public.schools(id) on delete cascade,
 name text not null,
 days_per_week smallint not null default 5 check(days_per_week between 1 and 7),
 periods_per_day smallint not null default 8 check(periods_per_day between 1 and 16),
 lesson_minutes smallint not null default 40 check(lesson_minutes between 15 and 180),
 start_time time not null default '08:00',
 break_after_period smallint,
 break_minutes smallint not null default 20,
 active boolean not null default true,
 created_at timestamptz not null default now(),
 unique(id,school_id)
);

create table if not exists public.timetable_periods (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null references public.schools(id) on delete cascade,
 template_id uuid not null,
 period_number smallint not null,
 starts_at time not null,
 ends_at time not null,
 period_type text not null default 'lesson' check(period_type in ('lesson','break','lunch','assembly','activity')),
 unique(template_id,period_number),
 foreign key(template_id,school_id) references public.timetable_templates(id,school_id) on delete cascade,
 check(ends_at > starts_at)
);

create table if not exists public.teacher_availability (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null references public.schools(id) on delete cascade,
 teacher_id uuid not null,
 day_number smallint not null check(day_number between 1 and 7),
 period_number smallint not null,
 available boolean not null default true,
 reason text,
 foreign key(teacher_id,school_id) references public.staff_profiles(id,school_id) on delete cascade,
 unique(teacher_id,day_number,period_number)
);

create table if not exists public.timetable_requirements (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null references public.schools(id) on delete cascade,
 academic_year_id uuid not null,
 term_id uuid,
 grade_id uuid not null,
 stream_id uuid,
 learning_area_id uuid not null,
 teacher_id uuid not null,
 room_id uuid,
 periods_per_week smallint not null check(periods_per_week between 1 and 60),
 preferred_block_size smallint not null default 1 check(preferred_block_size between 1 and 3),
 fixed_day smallint check(fixed_day between 1 and 7),
 fixed_period smallint,
 active boolean not null default true,
 created_at timestamptz not null default now(),
 foreign key(academic_year_id,school_id) references public.academic_years(id,school_id) on delete cascade,
 foreign key(term_id,school_id) references public.academic_terms(id,school_id) on delete set null (term_id),
 foreign key(grade_id,school_id) references public.school_grades(id,school_id) on delete cascade,
 foreign key(stream_id,school_id) references public.school_streams(id,school_id) on delete set null (stream_id),
 foreign key(learning_area_id,school_id) references public.learning_areas(id,school_id) on delete restrict,
 foreign key(teacher_id,school_id) references public.staff_profiles(id,school_id) on delete restrict,
 foreign key(room_id,school_id) references public.rooms(id,school_id) on delete set null (room_id)
);

create table if not exists public.timetable_versions (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null references public.schools(id) on delete cascade,
 academic_year_id uuid not null,
 term_id uuid,
 template_id uuid not null,
 version_number integer not null,
 status text not null default 'draft' check(status in ('draft','validated','published','archived')),
 generated_by uuid references auth.users(id),
 published_by uuid references auth.users(id),
 published_at timestamptz,
 validation_summary jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 unique(school_id,academic_year_id,version_number),
 unique(id,school_id),
 foreign key(academic_year_id,school_id) references public.academic_years(id,school_id) on delete cascade,
 foreign key(term_id,school_id) references public.academic_terms(id,school_id) on delete set null (term_id),
 foreign key(template_id,school_id) references public.timetable_templates(id,school_id) on delete restrict
);

-- Required composite candidate key for timetable_entries(requirement_id, school_id).
-- Keep this before timetable_entries is created because its FK depends on it.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'timetable_requirements_id_school_unique' and conrelid = 'public.timetable_requirements'::regclass) then
    alter table public.timetable_requirements add constraint timetable_requirements_id_school_unique unique (id, school_id);
  end if;
end $$;

create table if not exists public.timetable_entries (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null references public.schools(id) on delete cascade,
 timetable_version_id uuid not null,
 requirement_id uuid,
 day_number smallint not null check(day_number between 1 and 7),
 period_number smallint not null,
 block_length smallint not null default 1 check(block_length between 1 and 3),
 grade_id uuid not null,
 stream_id uuid,
 learning_area_id uuid not null,
 teacher_id uuid not null,
 room_id uuid,
 created_at timestamptz not null default now(),
 foreign key(timetable_version_id,school_id) references public.timetable_versions(id,school_id) on delete cascade,
 foreign key(requirement_id,school_id) references public.timetable_requirements(id,school_id) on delete set null (requirement_id),
 foreign key(grade_id,school_id) references public.school_grades(id,school_id) on delete cascade,
 foreign key(stream_id,school_id) references public.school_streams(id,school_id) on delete set null (stream_id),
 foreign key(learning_area_id,school_id) references public.learning_areas(id,school_id) on delete restrict,
 foreign key(teacher_id,school_id) references public.staff_profiles(id,school_id) on delete restrict,
 foreign key(room_id,school_id) references public.rooms(id,school_id) on delete set null (room_id)
);

create index if not exists idx_tt_req_school_year on public.timetable_requirements(school_id,academic_year_id,grade_id);
create index if not exists idx_tt_entries_version_day on public.timetable_entries(school_id,timetable_version_id,day_number,period_number);

alter table public.timetable_templates enable row level security;
alter table public.timetable_periods enable row level security;
alter table public.teacher_availability enable row level security;
alter table public.timetable_requirements enable row level security;
alter table public.timetable_versions enable row level security;
alter table public.timetable_entries enable row level security;

-- Read access is school-member scoped. Draft creation and publication should be performed
-- by trusted server-side scheduler/publisher functions after conflict validation.
do $$
declare t text;
begin
 foreach t in array array['timetable_templates','timetable_periods','teacher_availability','timetable_requirements','timetable_versions','timetable_entries'] loop
  execute format('drop policy if exists %I on public.%I',t||'_member_read',t);
  execute format('drop policy if exists %I on public.%I',t||'_admin_insert',t);
  execute format('drop policy if exists %I on public.%I',t||'_admin_update',t);
  execute format('drop policy if exists %I on public.%I',t||'_admin_delete',t);
  execute format('create policy %I on public.%I for select to authenticated using (public.is_school_member(school_id))',t||'_member_read',t);
  execute format('create policy %I on public.%I for insert to authenticated with check (public.has_school_role(school_id,array[''school_owner'',''director'',''headteacher'',''deputy_headteacher'',''dos'',''administrator'']))',t||'_admin_insert',t);
  execute format('create policy %I on public.%I for update to authenticated using (public.has_school_role(school_id,array[''school_owner'',''director'',''headteacher'',''deputy_headteacher'',''dos'',''administrator''])) with check (public.has_school_role(school_id,array[''school_owner'',''director'',''headteacher'',''deputy_headteacher'',''dos'',''administrator'']))',t||'_admin_update',t);
  execute format('create policy %I on public.%I for delete to authenticated using (public.has_school_role(school_id,array[''school_owner'',''director'',''headteacher'',''administrator'']))',t||'_admin_delete',t);
 end loop;
end $$;

-- Note: database exclusion constraints for teacher/class/room occupancy require a
-- normalized occupied-slot table or a validated scheduling RPC. The scheduler must
-- atomically reject any clash before publishing; UI-only validation is insufficient.
