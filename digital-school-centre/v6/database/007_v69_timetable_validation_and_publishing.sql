-- DIGITAL SCHOOL CENTRE V6.9
-- Database-backed timetable slot integrity, validation, workload checks and publication.
-- Apply only after migrations 001-006 on the dedicated DEVELOPMENT Supabase project.
-- Static review only: execute first on a disposable development database and run the acceptance tests.
-- This migration does not create or replace the existing six timetable tables.

begin;

-- Ensure the entry can be referenced together with its tenant.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'timetable_entries_id_school_unique' and conrelid = 'public.timetable_entries'::regclass) then
    alter table public.timetable_entries add constraint timetable_entries_id_school_unique unique (id, school_id);
  end if;
end $$;

-- One row per occupied lesson period. A double lesson creates two rows and a
-- triple lesson creates three rows. Unique indexes enforce teacher/room clashes.
create table if not exists public.timetable_entry_slots (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  timetable_version_id uuid not null,
  timetable_entry_id uuid not null,
  day_number smallint not null check (day_number between 1 and 7),
  period_number smallint not null check (period_number between 1 and 16),
  grade_id uuid not null,
  stream_id uuid,
  teacher_id uuid not null,
  room_id uuid,
  created_at timestamptz not null default now(),
  foreign key (timetable_version_id, school_id)
    references public.timetable_versions(id, school_id) on delete cascade,
  foreign key (timetable_entry_id, school_id)
    references public.timetable_entries(id, school_id) on delete cascade,
  foreign key (grade_id, school_id)
    references public.school_grades(id, school_id) on delete cascade,
  foreign key (stream_id, school_id)
    references public.school_streams(id, school_id) on delete cascade,
  foreign key (teacher_id, school_id)
    references public.staff_profiles(id, school_id) on delete restrict,
  foreign key (room_id, school_id)
    references public.rooms(id, school_id) on delete restrict,
  unique (timetable_entry_id, day_number, period_number)
);

create unique index if not exists uq_tt_slot_teacher
  on public.timetable_entry_slots(school_id, timetable_version_id, day_number, period_number, teacher_id);

-- Class/stream conflicts are checked pairwise in the validation RPC. A
-- simple unique index cannot correctly model a whole-grade lesson overlapping
-- any stream-specific lesson.
drop index if exists public.uq_tt_slot_class;

create unique index if not exists uq_tt_slot_room
  on public.timetable_entry_slots(school_id, timetable_version_id, day_number, period_number, room_id)
  where room_id is not null;

create index if not exists idx_tt_slots_version
  on public.timetable_entry_slots(school_id, timetable_version_id, day_number, period_number);

-- Optional per-teacher workload caps. If no row exists, the validator uses
-- conservative defaults (8 periods/day, 40/week, 4 consecutive periods).
create table if not exists public.timetable_teacher_limits (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  teacher_id uuid not null,
  max_periods_per_day smallint not null default 8 check (max_periods_per_day between 1 and 16),
  max_periods_per_week smallint not null default 40 check (max_periods_per_week between 1 and 80),
  max_consecutive_periods smallint not null default 4 check (max_consecutive_periods between 1 and 16),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (school_id, teacher_id),
  foreign key (teacher_id, school_id)
    references public.staff_profiles(id, school_id) on delete cascade
);

create index if not exists idx_tt_teacher_limits_school_teacher
  on public.timetable_teacher_limits(school_id, teacher_id) where active;

alter table public.timetable_teacher_limits enable row level security;
drop policy if exists timetable_teacher_limits_member_read on public.timetable_teacher_limits;
create policy timetable_teacher_limits_member_read on public.timetable_teacher_limits
  for select to authenticated using (public.is_school_member(school_id));
drop policy if exists timetable_teacher_limits_admin_write on public.timetable_teacher_limits;
create policy timetable_teacher_limits_admin_write on public.timetable_teacher_limits
  for all to authenticated
  using (public.has_school_role(school_id, array['school_owner','director','headteacher','deputy_headteacher','dos','administrator']))
  with check (public.has_school_role(school_id, array['school_owner','director','headteacher','deputy_headteacher','dos','administrator']));

-- Make table privileges explicit; row-level policies provide the school boundary.
revoke all on public.timetable_teacher_limits from public, anon, authenticated;
grant select, insert, update, delete on public.timetable_teacher_limits to authenticated;

-- Once a version is validated, its entries cannot be changed directly.
-- Administrators must create a new draft version for amendments.
create or replace function public.guard_timetable_entry_version_state()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_version_id uuid;
  v_school_id uuid;
  v_status text;
  v_old_status text;
begin
  if tg_op = 'DELETE' then
    v_version_id := old.timetable_version_id;
    v_school_id := old.school_id;
  else
    v_version_id := new.timetable_version_id;
    v_school_id := new.school_id;
  end if;

  -- On UPDATE, also protect the source version so an entry cannot be moved
  -- out of a validated/published version into a draft version.
  if tg_op = 'UPDATE' then
    if old.timetable_version_id is distinct from new.timetable_version_id
       or old.school_id is distinct from new.school_id then
      raise exception 'A timetable entry cannot be moved between versions or schools; create a new draft entry';
    end if;
  end if;

  -- Lock the parent version while editing. Validation takes the same lock, so
  -- an entry cannot be changed concurrently after the validator has checked it.
  select status into v_status
  from public.timetable_versions
  where id = v_version_id and school_id = v_school_id
  for update;

  -- A parent-version cascade delete removes entries after the parent is gone.
  if tg_op = 'DELETE' and not found then return old; end if;

  if v_status is distinct from 'draft' then
    raise exception 'Only draft timetable versions can have entries changed; create a new draft version';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_timetable_entry_version_state on public.timetable_entries;
create trigger trg_guard_timetable_entry_version_state
before insert or update or delete on public.timetable_entries
for each row execute function public.guard_timetable_entry_version_state();

alter table public.timetable_entry_slots enable row level security;

drop policy if exists timetable_entry_slots_member_read on public.timetable_entry_slots;
create policy timetable_entry_slots_member_read
  on public.timetable_entry_slots
  for select to authenticated
  using (public.is_school_member(school_id));

-- No client role may write the slot ledger. The SECURITY DEFINER validator owns these writes.
revoke all on public.timetable_entry_slots from public, anon, authenticated;
grant select on public.timetable_entry_slots to authenticated;

-- Rebuild the normalized occupied-slot rows and validate the selected draft.
-- Returns {valid, issues, occupied_slots}. It never publishes the timetable.
create or replace function public.validate_timetable_version(p_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v public.timetable_versions%rowtype;
  issues jsonb := '[]'::jsonb;
  issue_count integer := 0;
  slot_count integer := 0;
begin
  select * into v
  from public.timetable_versions
  where id = p_version_id
  for update;

  if not found then
    raise exception 'Timetable version not found';
  end if;

  if not public.is_school_member(v.school_id)
     or not public.has_school_role(v.school_id,
       array['school_owner','director','headteacher','deputy_headteacher','dos','administrator']) then
    raise exception 'Not authorised to validate this school timetable';
  end if;

  if v.status not in ('draft','validated') then
    raise exception 'Only draft or validated timetable versions can be validated';
  end if;

  -- Template and school-calendar checks.
  if not exists (
    select 1 from public.timetable_templates t
    where t.id = v.template_id and t.school_id = v.school_id and t.active = true
  ) then
    issues := issues || jsonb_build_array(jsonb_build_object(
      'code','INVALID_TEMPLATE','message','The timetable template is missing or inactive'));
  end if;

  -- Every entry must fit inside the template's day and period limits and use
  -- lesson periods only (not break, lunch, assembly or activity periods).
  select count(*) into issue_count
  from public.timetable_entries e
  join public.timetable_templates t
    on t.id = v.template_id and t.school_id = v.school_id
  where e.school_id = v.school_id
    and e.timetable_version_id = v.id
    and (
      e.day_number > t.days_per_week
      or e.period_number < 1
      or e.period_number + e.block_length - 1 > t.periods_per_day
      or exists (
        select 1
        from generate_series(e.period_number, e.period_number + e.block_length - 1) as p(n)
        left join public.timetable_periods tp
          on tp.school_id = e.school_id
         and tp.template_id = t.id
         and tp.period_number = p.n
        where tp.id is null or tp.period_type <> 'lesson'
      )
    );
  if issue_count > 0 then
    issues := issues || jsonb_build_array(jsonb_build_object(
      'code','INVALID_PERIOD','count',issue_count,
      'message','One or more lessons fall outside the template or overlap a non-teaching period'));
  end if;

  -- Staff must be active and qualified for the assigned learning area.
  select count(*) into issue_count
  from public.timetable_entries e
  left join public.staff_profiles sp
    on sp.id = e.teacher_id and sp.school_id = e.school_id
  left join public.teacher_learning_areas tla
    on tla.teacher_id = e.teacher_id
   and tla.learning_area_id = e.learning_area_id
   and tla.school_id = e.school_id
   and tla.qualified = true
  where e.school_id = v.school_id
    and e.timetable_version_id = v.id
    and (sp.id is null or sp.active is distinct from true or tla.id is null);
  if issue_count > 0 then
    issues := issues || jsonb_build_array(jsonb_build_object(
      'code','UNQUALIFIED_OR_INACTIVE_TEACHER','count',issue_count,
      'message','One or more assigned teachers are inactive or not qualified for the learning area'));
  end if;

  -- Assigned grades, streams and rooms must be active and belong to this school.
  select count(*) into issue_count
  from public.timetable_entries e
  left join public.school_grades g
    on g.id = e.grade_id and g.school_id = e.school_id
  left join public.school_streams s
    on s.id = e.stream_id and s.school_id = e.school_id
  left join public.rooms r
    on r.id = e.room_id and r.school_id = e.school_id
  where e.school_id = v.school_id
    and e.timetable_version_id = v.id
    and (
      g.id is null or g.active is distinct from true
      or (e.stream_id is not null and (s.id is null or s.active is distinct from true))
      or (e.room_id is not null and (r.id is null or r.active is distinct from true))
    );
  if issue_count > 0 then
    issues := issues || jsonb_build_array(jsonb_build_object(
      'code','INACTIVE_OR_INVALID_RESOURCE','count',issue_count,
      'message','One or more grades, streams or rooms are missing, inactive or outside this school'));
  end if;

  -- Every timetable entry must be linked to an active requirement in this school.
  -- A LEFT JOIN is intentional: a nullable requirement_id must not bypass validation.
  select count(*) into issue_count
  from public.timetable_entries e
  left join public.timetable_requirements q
    on q.id = e.requirement_id and q.school_id = e.school_id
  where e.school_id = v.school_id
    and e.timetable_version_id = v.id
    and (e.requirement_id is null or q.id is null or q.active is distinct from true);
  if issue_count > 0 then
    issues := issues || jsonb_build_array(jsonb_build_object(
      'code','MISSING_OR_INACTIVE_REQUIREMENT','count',issue_count,
      'message','Every scheduled lesson must link to an active weekly requirement in this school'));
  end if;

  -- A requirement's fixed day and fixed period apply to the start of its block.
  select count(*) into issue_count
  from public.timetable_entries e
  join public.timetable_requirements q
    on q.id = e.requirement_id and q.school_id = e.school_id
  where e.school_id = v.school_id
    and e.timetable_version_id = v.id
    and (
      (q.fixed_day is not null and e.day_number <> q.fixed_day)
      or (q.fixed_period is not null and e.period_number <> q.fixed_period)
    );
  if issue_count > 0 then
    issues := issues || jsonb_build_array(jsonb_build_object(
      'code','FIXED_SLOT_VIOLATION','count',issue_count,
      'message','One or more lessons violate their required fixed day or starting period'));
  end if;

  -- A linked timetable entry must retain the exact grade, stream, learning area,
  -- teacher and room specified by its requirement.
  select count(*) into issue_count
  from public.timetable_entries e
  join public.timetable_requirements q
    on q.id = e.requirement_id and q.school_id = e.school_id
  where e.school_id = v.school_id
    and e.timetable_version_id = v.id
    and (
      q.active is distinct from true
      or q.academic_year_id <> v.academic_year_id
      or q.term_id is distinct from v.term_id
      or q.grade_id is distinct from e.grade_id
      or q.stream_id is distinct from e.stream_id
      or q.learning_area_id is distinct from e.learning_area_id
      or q.teacher_id is distinct from e.teacher_id
      or q.room_id is distinct from e.room_id
    );
  if issue_count > 0 then
    issues := issues || jsonb_build_array(jsonb_build_object(
      'code','REQUIREMENT_MISMATCH','count',issue_count,
      'message','One or more scheduled lessons do not match their linked weekly requirement'));
  end if;

  -- Explicit unavailable periods are hard constraints for every period in a block.
  select count(*) into issue_count
  from public.timetable_entries e
  cross join lateral generate_series(e.period_number, e.period_number + e.block_length - 1) p(n)
  join public.teacher_availability a
    on a.school_id = e.school_id
   and a.teacher_id = e.teacher_id
   and a.day_number = e.day_number
   and a.period_number = p.n
   and a.available = false
  where e.school_id = v.school_id
    and e.timetable_version_id = v.id;
  if issue_count > 0 then
    issues := issues || jsonb_build_array(jsonb_build_object(
      'code','TEACHER_UNAVAILABLE','count',issue_count,
      'message','One or more lessons are assigned during a teacher unavailable period'));
  end if;

  -- Every active requirement for this academic year/term must be fully scheduled.
  select count(*) into issue_count
  from public.timetable_requirements q
  where q.school_id = v.school_id
    and q.academic_year_id = v.academic_year_id
    and q.active = true
    and (q.term_id is not distinct from v.term_id)
    and (
      select coalesce(sum(e.block_length),0)
      from public.timetable_entries e
      where e.school_id = q.school_id
        and e.timetable_version_id = v.id
        and e.requirement_id = q.id
    ) <> q.periods_per_week;
  if issue_count > 0 then
    issues := issues || jsonb_build_array(jsonb_build_object(
      'code','INCOMPLETE_REQUIREMENTS','count',issue_count,
      'message','One or more active weekly lesson requirements are not fully scheduled'));
  end if;

  -- Detect teacher, class and room overlaps by expanding every block into slots.
  -- A grade-wide lesson (stream_id NULL) conflicts with every stream in that grade.
  with expanded as (
    select e.id entry_id, e.day_number, p.n::smallint period_number, e.teacher_id,
           e.grade_id, e.stream_id, e.room_id
    from public.timetable_entries e
    cross join lateral generate_series(e.period_number, e.period_number + e.block_length - 1) p(n)
    where e.school_id = v.school_id and e.timetable_version_id = v.id
  ),
  teacher_conflicts as (
    select count(*) n from (
      select day_number, period_number, teacher_id from expanded
      group by day_number, period_number, teacher_id having count(*) > 1
    ) x
  ),
  class_conflicts as (
    select count(*) n from expanded a
    join expanded b on b.entry_id > a.entry_id
      and b.day_number = a.day_number
      and b.period_number = a.period_number
      and b.grade_id = a.grade_id
      and (a.stream_id is null or b.stream_id is null or a.stream_id = b.stream_id)
  ),
  room_conflicts as (
    select count(*) n from (
      select day_number, period_number, room_id from expanded where room_id is not null
      group by day_number, period_number, room_id having count(*) > 1
    ) x
  )
  select issues || coalesce(jsonb_agg(jsonb_build_object(
    'code',code,'count',n,'message',message
  )) filter (where n > 0), '[]'::jsonb)
  into issues
  from (
    select 'TEACHER_CLASH'::text code, n, 'Teacher overlap detected'::text message from teacher_conflicts
    union all
    select 'CLASS_CLASH', n, 'Class or stream overlap detected' from class_conflicts
    union all
    select 'ROOM_CLASH', n, 'Room overlap detected' from room_conflicts
  ) conflicts;

  -- Enforce configurable teacher daily, weekly and consecutive-period limits.
  with expanded as (
    select e.teacher_id, e.day_number, p.n::smallint period_number
    from public.timetable_entries e
    cross join lateral generate_series(e.period_number, e.period_number + e.block_length - 1) p(n)
    where e.school_id = v.school_id and e.timetable_version_id = v.id
  ), daily as (
    select teacher_id, day_number, count(*) periods
    from expanded group by teacher_id, day_number
  ), weekly as (
    select teacher_id, count(*) periods from expanded group by teacher_id
  ), max_runs as (
    select teacher_id, max(max_run) max_run from (
      select teacher_id, day_number, count(*) max_run
      from (
        select teacher_id, day_number, period_number,
          period_number - row_number() over (partition by teacher_id,day_number order by period_number) grp
        from expanded
      ) z group by teacher_id,day_number,grp
    ) r group by teacher_id
  ), violations as (
    select d.teacher_id, 'TEACHER_DAILY_LIMIT' code
    from daily d left join public.timetable_teacher_limits l
      on l.school_id = v.school_id and l.teacher_id = d.teacher_id and l.active
    where d.periods > coalesce(l.max_periods_per_day,8)
    union all
    select w.teacher_id, 'TEACHER_WEEKLY_LIMIT'
    from weekly w left join public.timetable_teacher_limits l
      on l.school_id = v.school_id and l.teacher_id = w.teacher_id and l.active
    where w.periods > coalesce(l.max_periods_per_week,40)
    union all
    select m.teacher_id, 'TEACHER_CONSECUTIVE_LIMIT'
    from max_runs m left join public.timetable_teacher_limits l
      on l.school_id = v.school_id and l.teacher_id = m.teacher_id and l.active
    where m.max_run > coalesce(l.max_consecutive_periods,4)
  )
  select issues || coalesce(jsonb_agg(jsonb_build_object(
    'code',code,'teacher_id',teacher_id,
    'message',case code when 'TEACHER_DAILY_LIMIT' then 'Teacher daily period limit exceeded'
      when 'TEACHER_WEEKLY_LIMIT' then 'Teacher weekly period limit exceeded'
      else 'Teacher consecutive-period limit exceeded' end
  )), '[]'::jsonb)
  into issues from violations;

  if jsonb_array_length(issues) > 0 then
    update public.timetable_versions
      set status = 'draft', validation_summary = jsonb_build_object(
        'valid',false,'issues',issues,'checked_at',now())
    where id = v.id and school_id = v.school_id;
    return jsonb_build_object('valid',false,'issues',issues,'occupied_slots',0);
  end if;

  -- Replace slot ledger only after all checks pass. Unique indexes provide a
  -- final atomic database guarantee against concurrent or duplicate slot writes.
  delete from public.timetable_entry_slots
  where school_id = v.school_id and timetable_version_id = v.id;

  insert into public.timetable_entry_slots (
    school_id,timetable_version_id,timetable_entry_id,day_number,period_number,
    grade_id,stream_id,teacher_id,room_id
  )
  select e.school_id,e.timetable_version_id,e.id,e.day_number,p.n::smallint,
         e.grade_id,e.stream_id,e.teacher_id,e.room_id
  from public.timetable_entries e
  cross join lateral generate_series(e.period_number, e.period_number + e.block_length - 1) p(n)
  where e.school_id = v.school_id and e.timetable_version_id = v.id;

  get diagnostics slot_count = row_count;

  update public.timetable_versions
    set status = 'validated',
        validation_summary = jsonb_build_object(
          'valid',true,'issues','[]'::jsonb,'occupied_slots',slot_count,'checked_at',now())
  where id = v.id and school_id = v.school_id;

  return jsonb_build_object('valid',true,'issues','[]'::jsonb,'occupied_slots',slot_count);
end;
$$;

-- Publication is a separate, leadership-only operation and can only publish
-- a version that passed validate_timetable_version.
create or replace function public.publish_timetable_version(p_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v public.timetable_versions%rowtype;
begin
  select * into v
  from public.timetable_versions
  where id = p_version_id
  for update;

  if not found then
    raise exception 'Timetable version not found';
  end if;

  if not public.is_school_member(v.school_id)
     or not public.has_school_role(v.school_id,
       array['school_owner','director','headteacher','administrator']) then
    raise exception 'Only authorised school leadership may publish a timetable';
  end if;

  if v.status <> 'validated'
     or coalesce((v.validation_summary->>'valid')::boolean,false) is not true then
    raise exception 'Validate the timetable successfully before publication';
  end if;

  -- Re-run validation immediately before publication so changes to teacher
  -- availability, qualifications or requirements cannot invalidate an old approval.
  if coalesce((public.validate_timetable_version(v.id)->>'valid')::boolean,false) is not true then
    raise exception 'Timetable validation failed; resolve the reported issues before publication';
  end if;

  if not exists (
    select 1 from public.timetable_entry_slots s
    where s.school_id = v.school_id and s.timetable_version_id = v.id
  ) then
    raise exception 'No validated occupied timetable slots exist';
  end if;

  -- Serialize publication for a school and academic year.
  perform pg_advisory_xact_lock(hashtextextended(v.school_id::text || ':' || v.academic_year_id::text,0));

  update public.timetable_versions
  set status = 'archived'
  where school_id = v.school_id
    and academic_year_id = v.academic_year_id
    and status = 'published'
    and id <> v.id;

  update public.timetable_versions
  set status = 'published',
      published_by = auth.uid(),
      published_at = now()
  where id = v.id and school_id = v.school_id;

  insert into public.audit_events (school_id, actor_user_id, action, entity_table, entity_id, reason, metadata)
  values (v.school_id, auth.uid(), 'timetable_published', 'timetable_versions', v.id::text,
          'Validated timetable published by authorised school leadership',
          jsonb_build_object('academic_year_id',v.academic_year_id,'term_id',v.term_id,'version_number',v.version_number));

  return jsonb_build_object(
    'published',true,
    'timetable_version_id',v.id,
    'school_id',v.school_id,
    'published_at',now()
  );
end;
$$;

revoke all on function public.guard_timetable_entry_version_state() from public;
revoke all on function public.validate_timetable_version(uuid) from public;
revoke all on function public.publish_timetable_version(uuid) from public;
grant execute on function public.validate_timetable_version(uuid) to authenticated;
grant execute on function public.publish_timetable_version(uuid) to authenticated;

commit;
