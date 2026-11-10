-- DIGITAL SCHOOL CENTRE V6.4
-- Live academic operations: assessment lifecycle, marks moderation, report snapshots,
-- timetable validation and controlled publication.
-- Apply AFTER migrations 001-004 in a NEW V6 development Supabase project.

create table if not exists public.school_assessments (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null references public.schools(id) on delete cascade,
 academic_year_id uuid not null,
 term_id uuid,
 name text not null,
 assessment_type text not null default 'summative'
   check (assessment_type in ('diagnostic','formative','summative','project','practical','portfolio','kjsea')),
 curriculum_family text not null default 'CBE',
 stage_code text,
 grade_id uuid,
 status text not null default 'draft'
   check (status in ('draft','open','submitted','moderation','approved','locked','archived')),
 opens_on date,
 closes_on date,
 created_by uuid references auth.users(id),
 approved_by uuid references auth.users(id),
 approved_at timestamptz,
 locked_by uuid references auth.users(id),
 locked_at timestamptz,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 unique(id,school_id),
 foreign key(academic_year_id,school_id) references public.academic_years(id,school_id) on delete cascade,
 foreign key(term_id,school_id) references public.academic_terms(id,school_id) on delete set null (term_id),
 foreign key(grade_id,school_id) references public.school_grades(id,school_id) on delete set null (grade_id)
);

create table if not exists public.assessment_components (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null references public.schools(id) on delete cascade,
 assessment_id uuid not null,
 learning_area_id uuid not null,
 title text not null,
 maximum_score numeric(8,2),
 scoring_mode text not null default 'numeric'
   check(scoring_mode in ('numeric','descriptor','rubric','portfolio','competency')),
 achievement_scale jsonb not null default '[]'::jsonb,
 weight numeric(7,3) not null default 1 check(weight > 0),
 created_at timestamptz not null default now(),
 unique(id,school_id),
 foreign key(assessment_id,school_id) references public.school_assessments(id,school_id) on delete cascade,
 foreign key(learning_area_id,school_id) references public.learning_areas(id,school_id) on delete restrict,
 check(maximum_score is null or maximum_score > 0)
);

create table if not exists public.assessment_marks (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null references public.schools(id) on delete cascade,
 assessment_id uuid not null,
 component_id uuid not null,
 learner_id uuid not null,
 raw_score numeric(8,2),
 maximum_score numeric(8,2),
 achievement_code text,
 teacher_comment text,
 evidence_reference text,
 status text not null default 'draft'
   check(status in ('draft','submitted','queried','moderated','approved')),
 entered_by uuid references auth.users(id),
 moderated_by uuid references auth.users(id),
 moderated_at timestamptz,
 updated_at timestamptz not null default now(),
 unique(assessment_id,component_id,learner_id),
 foreign key(assessment_id,school_id) references public.school_assessments(id,school_id) on delete cascade,
 foreign key(component_id,school_id) references public.assessment_components(id,school_id) on delete cascade,
 foreign key(learner_id,school_id) references public.learners(id,school_id) on delete cascade,
 check((raw_score is null and maximum_score is null) or
       (raw_score is not null and maximum_score is not null and maximum_score > 0 and raw_score between 0 and maximum_score))
);

create table if not exists public.report_card_snapshots (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null references public.schools(id) on delete cascade,
 assessment_id uuid not null,
 learner_id uuid not null,
 snapshot jsonb not null,
 generated_by uuid references auth.users(id),
 generated_at timestamptz not null default now(),
 unique(assessment_id,learner_id),
 foreign key(assessment_id,school_id) references public.school_assessments(id,school_id) on delete cascade,
 foreign key(learner_id,school_id) references public.learners(id,school_id) on delete cascade
);

create index if not exists idx_assessments_school_year on public.school_assessments(school_id,academic_year_id,status);
create index if not exists idx_marks_school_assessment on public.assessment_marks(school_id,assessment_id,component_id);
create index if not exists idx_marks_learner on public.assessment_marks(school_id,learner_id);

alter table public.school_assessments enable row level security;
alter table public.assessment_components enable row level security;
alter table public.assessment_marks enable row level security;
alter table public.report_card_snapshots enable row level security;

-- Staff access is scoped to their school. Sensitive learner results are never public.
create policy "assessment members read" on public.school_assessments
for select to authenticated using (public.is_school_member(school_id));
create policy "assessment admins insert" on public.school_assessments
for insert to authenticated with check (public.has_school_role(school_id,array['school_owner','director','headteacher','deputy_headteacher','dos','administrator']));
create policy "assessment admins update" on public.school_assessments
for update to authenticated using (public.has_school_role(school_id,array['school_owner','director','headteacher','deputy_headteacher','dos','administrator']))
with check (public.has_school_role(school_id,array['school_owner','director','headteacher','deputy_headteacher','dos','administrator']));

create policy "component members read" on public.assessment_components
for select to authenticated using (public.is_school_member(school_id));
create policy "component admins manage" on public.assessment_components
for all to authenticated using (public.has_school_role(school_id,array['school_owner','director','headteacher','deputy_headteacher','dos','administrator']))
with check (public.has_school_role(school_id,array['school_owner','director','headteacher','deputy_headteacher','dos','administrator']));

create policy "marks authorised staff read" on public.assessment_marks
for select to authenticated using (public.has_school_role(school_id,array['school_owner','director','headteacher','deputy_headteacher','dos','administrator','registrar','teacher','class_teacher']));
create policy "marks authorised staff insert" on public.assessment_marks
for insert to authenticated with check (public.has_school_role(school_id,array['school_owner','director','headteacher','deputy_headteacher','dos','administrator','teacher','class_teacher']));
create policy "marks authorised staff update" on public.assessment_marks
for update to authenticated using (public.has_school_role(school_id,array['school_owner','director','headteacher','deputy_headteacher','dos','administrator','teacher','class_teacher']))
with check (public.has_school_role(school_id,array['school_owner','director','headteacher','deputy_headteacher','dos','administrator','teacher','class_teacher']));

create policy "report snapshots authorised read" on public.report_card_snapshots
for select to authenticated using (public.has_school_role(school_id,array['school_owner','director','headteacher','deputy_headteacher','dos','administrator','registrar','teacher','class_teacher']));
create policy "report snapshots admin insert" on public.report_card_snapshots
for insert to authenticated with check (public.has_school_role(school_id,array['school_owner','director','headteacher','administrator']));
create policy "report snapshots admin update" on public.report_card_snapshots
for update to authenticated using (public.has_school_role(school_id,array['school_owner','director','headteacher','administrator']))
with check (public.has_school_role(school_id,array['school_owner','director','headteacher','administrator']));

-- Publish only a validated, conflict-free timetable. The check is repeated server-side,
-- so a browser cannot bypass it by calling a direct update.
create or replace function public.publish_timetable(p_version_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.timetable_versions%rowtype; clashes integer; entry_count integer;
begin
 select * into v from public.timetable_versions where id=p_version_id for update;
 if not found then raise exception 'Timetable version not found'; end if;
 if not public.has_school_role(v.school_id,array['school_owner','director','headteacher','deputy_headteacher','dos','administrator']) then
   raise exception 'Not authorised to publish this timetable';
 end if;
 if v.status not in ('draft','validated') then raise exception 'Only draft or validated versions can be published'; end if;
 select count(*) into entry_count from public.timetable_entries where school_id=v.school_id and timetable_version_id=v.id;
 if entry_count=0 then raise exception 'Cannot publish an empty timetable version'; end if;
 select count(*) into clashes from (
   select e.day_number, s.period_number, e.teacher_id, 'teacher' as resource
   from public.timetable_entries e
   cross join lateral generate_series(e.period_number,e.period_number+e.block_length-1) s(period_number)
   where e.school_id=v.school_id and e.timetable_version_id=v.id
   group by e.day_number,s.period_number,e.teacher_id having count(*)>1
   union all
   select e.day_number,s.period_number,e.grade_id, 'class' as resource
   from public.timetable_entries e
   cross join lateral generate_series(e.period_number,e.period_number+e.block_length-1) s(period_number)
   where e.school_id=v.school_id and e.timetable_version_id=v.id
   group by e.day_number,s.period_number,e.grade_id,e.stream_id having count(*)>1
   union all
   select e.day_number,s.period_number,e.room_id,'room' as resource
   from public.timetable_entries e
   cross join lateral generate_series(e.period_number,e.period_number+e.block_length-1) s(period_number)
   where e.school_id=v.school_id and e.timetable_version_id=v.id and e.room_id is not null
   group by e.day_number,s.period_number,e.room_id having count(*)>1
 ) x;
 if clashes>0 then raise exception 'Timetable has % resource clashes; publication blocked',clashes; end if;
 update public.timetable_versions set status='published',published_by=auth.uid(),published_at=now()
 where id=v.id;
 update public.timetable_versions set status='archived'
 where school_id=v.school_id and academic_year_id=v.academic_year_id and id<>v.id and status='published';
 return jsonb_build_object('published',true,'version_id',v.id,'published_at',now());
end $$;

revoke all on function public.publish_timetable(uuid) from public;
grant execute on function public.publish_timetable(uuid) to authenticated;

-- Transition assessment lifecycle using role checks and immutable locked state.
create or replace function public.set_assessment_status(p_assessment_id uuid,p_status text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.school_assessments%rowtype;
begin
 select * into a from public.school_assessments where id=p_assessment_id for update;
 if not found then raise exception 'Assessment not found'; end if;
 if not public.is_school_member(a.school_id) then raise exception 'Not authorised'; end if;
 if p_status not in ('open','submitted','moderation','approved','locked','archived') then raise exception 'Invalid status'; end if;
 if a.status='locked' then raise exception 'Locked assessments cannot be changed'; end if;
 if p_status in ('approved','locked','archived') and not public.has_school_role(a.school_id,array['school_owner','director','headteacher','administrator']) then
   raise exception 'Only school leadership may approve or lock results';
 end if;
 if p_status in ('submitted','moderation') and not public.has_school_role(a.school_id,array['school_owner','director','headteacher','deputy_headteacher','dos','administrator','teacher','class_teacher']) then
   raise exception 'Not authorised to submit results';
 end if;
 update public.school_assessments set status=p_status,
   approved_by=case when p_status='approved' then auth.uid() else approved_by end,
   approved_at=case when p_status='approved' then now() else approved_at end,
   locked_by=case when p_status='locked' then auth.uid() else locked_by end,
   locked_at=case when p_status='locked' then now() else locked_at end
 where id=p_assessment_id;
 return jsonb_build_object('assessment_id',p_assessment_id,'status',p_status);
end $$;
revoke all on function public.set_assessment_status(uuid,text) from public;
grant execute on function public.set_assessment_status(uuid,text) to authenticated;

-- Prevent direct edits to results after the parent assessment is locked.
create or replace function public.guard_locked_assessment_marks()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare st text; aid uuid;
begin
 if tg_op='DELETE' then aid := old.assessment_id; else aid := new.assessment_id; end if;
 select status into st from public.school_assessments where id=aid;
 if st='locked' then raise exception 'Results are locked; create an authorised amendment workflow'; end if;
 if tg_op='DELETE' then return old; end if;
 new.updated_at=now();
 return new;
end $$;
drop trigger if exists trg_guard_locked_assessment_marks on public.assessment_marks;
create trigger trg_guard_locked_assessment_marks before insert or update or delete on public.assessment_marks
for each row execute function public.guard_locked_assessment_marks();
