-- CBE READY V6.12: curriculum evidence, interventions, assignments and guardian snapshots
-- Apply only to a dedicated development Supabase project first. Never auto-run on production.
begin;

create table if not exists public.assessment_staff_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  grade_id uuid not null,
  stream_id uuid,
  learning_area_id uuid,
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint asa_grade_school_fk foreign key (grade_id, school_id) references public.school_grades(id, school_id),
  constraint asa_stream_school_fk foreign key (stream_id, school_id) references public.school_streams(id, school_id),
  constraint asa_area_school_fk foreign key (learning_area_id, school_id) references public.learning_areas(id, school_id)
);
create index if not exists idx_asa_user_scope on public.assessment_staff_assignments(school_id,user_id,grade_id,stream_id,learning_area_id) where active;

create table if not exists public.curriculum_strands (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  learning_area_id uuid not null,
  strand_name text not null,
  sub_strand_name text not null,
  competency_code text,
  learning_outcome text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint curriculum_strands_area_school_fk foreign key (learning_area_id,school_id) references public.learning_areas(id,school_id),
  constraint curriculum_strands_name_unique unique (school_id,learning_area_id,strand_name,sub_strand_name),
  constraint curriculum_strands_id_school_unique unique (id,school_id)
);
create index if not exists idx_curriculum_strands_area on public.curriculum_strands(school_id,learning_area_id,active);

create table if not exists public.assessment_component_strands (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  component_id uuid not null,
  strand_id uuid not null,
  weight numeric not null default 1 check (weight > 0),
  created_at timestamptz not null default now(),
  constraint acs_component_school_fk foreign key (component_id,school_id) references public.assessment_components(id,school_id),
  constraint acs_strand_school_fk foreign key (strand_id,school_id) references public.curriculum_strands(id,school_id) on delete cascade,
  constraint acs_unique unique (component_id,strand_id)
);
create index if not exists idx_acs_strand on public.assessment_component_strands(school_id,strand_id);

create table if not exists public.learner_interventions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  learner_id uuid not null,
  learning_area_id uuid,
  strand_id uuid,
  concern text not null,
  action_plan text not null,
  review_date date,
  status text not null default 'open' check (status in ('open','in_progress','reviewed','closed')),
  outcome text,
  created_by uuid references auth.users(id),
  reviewed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint intervention_learner_school_fk foreign key (learner_id,school_id) references public.learners(id,school_id),
  constraint intervention_area_school_fk foreign key (learning_area_id,school_id) references public.learning_areas(id,school_id),
  constraint intervention_strand_school_fk foreign key (strand_id,school_id) references public.curriculum_strands(id,school_id)
);
create index if not exists idx_interventions_learner on public.learner_interventions(school_id,learner_id,status);

create table if not exists public.school_cbe_settings (
  school_id uuid primary key references public.schools(id) on delete cascade,
  support_threshold numeric not null default 50 check (support_threshold between 0 and 100),
  percentage_bands jsonb not null default '[{"name":"Exceeding","min":80,"max":100},{"name":"Meeting","min":60,"max":79.99},{"name":"Approaching","min":40,"max":59.99},{"name":"Below","min":0,"max":39.99}]'::jsonb,
  achievement_scale jsonb not null default '[]'::jsonb,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.guardian_communications (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  guardian_id uuid not null,
  learner_id uuid not null,
  channel text not null check (channel in ('sms','email','portal')),
  subject text,
  message text not null,
  status text not null default 'queued' check (status in ('queued','sent','failed','cancelled')),
  provider_reference text,
  queued_by uuid references auth.users(id),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint guardian_comm_learner_school_fk foreign key (learner_id,school_id) references public.learners(id,school_id),
  constraint guardian_comm_guardian_school_fk foreign key (guardian_id,school_id) references public.guardians(id,school_id) on delete cascade
);
create index if not exists idx_guardian_comm_queue on public.guardian_communications(school_id,status,created_at);

alter table public.assessment_staff_assignments enable row level security;
alter table public.curriculum_strands enable row level security;
alter table public.assessment_component_strands enable row level security;
alter table public.learner_interventions enable row level security;
alter table public.school_cbe_settings enable row level security;
alter table public.guardian_communications enable row level security;

grant select, insert, update, delete on public.assessment_staff_assignments to authenticated;
grant select, insert, update, delete on public.curriculum_strands to authenticated;
grant select, insert, update, delete on public.assessment_component_strands to authenticated;
grant select, insert, update, delete on public.learner_interventions to authenticated;
grant select, insert, update, delete on public.school_cbe_settings to authenticated;
grant select, insert, update, delete on public.guardian_communications to authenticated;

drop policy if exists "asa admins manage" on public.assessment_staff_assignments;
create policy "asa admins manage" on public.assessment_staff_assignments for all to authenticated
using (public.has_school_role(school_id,array['school_owner','director','headteacher','deputy_headteacher','dos','administrator']))
with check (public.has_school_role(school_id,array['school_owner','director','headteacher','deputy_headteacher','dos','administrator']));
drop policy if exists "asa teachers read own" on public.assessment_staff_assignments;
create policy "asa teachers read own" on public.assessment_staff_assignments for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "curriculum strands members read" on public.curriculum_strands;
create policy "curriculum strands members read" on public.curriculum_strands for select to authenticated using (public.is_school_member(school_id));
drop policy if exists "curriculum strands admins manage" on public.curriculum_strands;
create policy "curriculum strands admins manage" on public.curriculum_strands for all to authenticated
using (public.has_school_role(school_id,array['school_owner','director','headteacher','deputy_headteacher','dos','administrator']))
with check (public.has_school_role(school_id,array['school_owner','director','headteacher','deputy_headteacher','dos','administrator']));

drop policy if exists "component strands members read" on public.assessment_component_strands;
create policy "component strands members read" on public.assessment_component_strands for select to authenticated using (public.is_school_member(school_id));
drop policy if exists "component strands admins manage" on public.assessment_component_strands;
create policy "component strands admins manage" on public.assessment_component_strands for all to authenticated
using (public.has_school_role(school_id,array['school_owner','director','headteacher','deputy_headteacher','dos','administrator']))
with check (public.has_school_role(school_id,array['school_owner','director','headteacher','deputy_headteacher','dos','administrator']));

drop policy if exists "interventions assigned staff read" on public.learner_interventions;
create policy "interventions assigned staff read" on public.learner_interventions for select to authenticated
using (
 public.has_school_role(school_id,array['school_owner','director','headteacher','deputy_headteacher','dos','administrator','registrar'])
 or exists (
  select 1 from public.assessment_staff_assignments a
  join public.learners l on l.id=learner_interventions.learner_id and l.school_id=learner_interventions.school_id
  where a.school_id=learner_interventions.school_id and a.user_id=(select auth.uid()) and a.active
    and exists (select 1 from public.school_memberships sm where sm.school_id=a.school_id and sm.user_id=(select auth.uid()) and sm.active and sm.role in ('teacher','class_teacher'))
    and a.grade_id=l.grade_id and (a.stream_id is null or a.stream_id=l.stream_id)
    and (a.learning_area_id is null or a.learning_area_id=learner_interventions.learning_area_id)
 )
);
drop policy if exists "interventions assigned staff insert" on public.learner_interventions;
create policy "interventions assigned staff insert" on public.learner_interventions for insert to authenticated
with check (
 public.has_school_role(school_id,array['school_owner','director','headteacher','deputy_headteacher','dos','administrator'])
 or exists (
  select 1 from public.assessment_staff_assignments a
  join public.learners l on l.id=learner_interventions.learner_id and l.school_id=learner_interventions.school_id
  where a.school_id=learner_interventions.school_id and a.user_id=(select auth.uid()) and a.active
    and exists (select 1 from public.school_memberships sm where sm.school_id=a.school_id and sm.user_id=(select auth.uid()) and sm.active and sm.role in ('teacher','class_teacher'))
    and a.grade_id=l.grade_id and (a.stream_id is null or a.stream_id=l.stream_id)
    and (a.learning_area_id is null or a.learning_area_id=learner_interventions.learning_area_id)
 )
);
drop policy if exists "interventions assigned staff update" on public.learner_interventions;
create policy "interventions assigned staff update" on public.learner_interventions for update to authenticated
using (
 public.has_school_role(school_id,array['school_owner','director','headteacher','deputy_headteacher','dos','administrator'])
 or exists (
  select 1 from public.assessment_staff_assignments a
  join public.learners l on l.id=learner_interventions.learner_id and l.school_id=learner_interventions.school_id
  where a.school_id=learner_interventions.school_id and a.user_id=(select auth.uid()) and a.active
    and exists (select 1 from public.school_memberships sm where sm.school_id=a.school_id and sm.user_id=(select auth.uid()) and sm.active and sm.role in ('teacher','class_teacher'))
    and a.grade_id=l.grade_id and (a.stream_id is null or a.stream_id=l.stream_id)
    and (a.learning_area_id is null or a.learning_area_id=learner_interventions.learning_area_id)
 )
)
with check (
 public.has_school_role(school_id,array['school_owner','director','headteacher','deputy_headteacher','dos','administrator'])
 or exists (
  select 1 from public.assessment_staff_assignments a
  join public.learners l on l.id=learner_interventions.learner_id and l.school_id=learner_interventions.school_id
  where a.school_id=learner_interventions.school_id and a.user_id=(select auth.uid()) and a.active
    and exists (select 1 from public.school_memberships sm where sm.school_id=a.school_id and sm.user_id=(select auth.uid()) and sm.active and sm.role in ('teacher','class_teacher'))
    and a.grade_id=l.grade_id and (a.stream_id is null or a.stream_id=l.stream_id)
    and (a.learning_area_id is null or a.learning_area_id=learner_interventions.learning_area_id)
 )
);

drop policy if exists "school cbe settings admins manage" on public.school_cbe_settings;
create policy "school cbe settings admins manage" on public.school_cbe_settings for all to authenticated
using (public.has_school_role(school_id,array['school_owner','director','headteacher','deputy_headteacher','dos','administrator']))
with check (public.has_school_role(school_id,array['school_owner','director','headteacher','deputy_headteacher','dos','administrator']));
drop policy if exists "school cbe settings members read" on public.school_cbe_settings;
create policy "school cbe settings members read" on public.school_cbe_settings for select to authenticated using (public.is_school_member(school_id));

drop policy if exists "guardian communications admins manage" on public.guardian_communications;
create policy "guardian communications admins manage" on public.guardian_communications for all to authenticated
using (public.has_school_role(school_id,array['school_owner','director','headteacher','deputy_headteacher','administrator']))
with check (public.has_school_role(school_id,array['school_owner','director','headteacher','deputy_headteacher','administrator']));

-- Assignment-scoped learner access for teachers/class teachers.
drop policy if exists "assigned teachers read learners" on public.learners;
create policy "assigned teachers read learners" on public.learners for select to authenticated
using (
 exists (
  select 1 from public.assessment_staff_assignments a
  where a.school_id=learners.school_id and a.user_id=(select auth.uid()) and a.active
    and exists (select 1 from public.school_memberships sm where sm.school_id=a.school_id and sm.user_id=(select auth.uid()) and sm.active and sm.role in ('teacher','class_teacher'))
    and a.grade_id=learners.grade_id and (a.stream_id is null or a.stream_id=learners.stream_id)
 )
);

-- Replace school-wide teacher marks permissions with assigned class/learning-area access.
drop policy if exists "marks authorised staff read" on public.assessment_marks;
drop policy if exists "marks authorised staff insert" on public.assessment_marks;
drop policy if exists "marks authorised staff update" on public.assessment_marks;
create policy "marks leaders read" on public.assessment_marks for select to authenticated
using (public.has_school_role(school_id,array['school_owner','director','headteacher','deputy_headteacher','dos','administrator','registrar']));
create policy "marks assigned teachers read" on public.assessment_marks for select to authenticated
using (
 exists (
  select 1 from public.learners l
  join public.assessment_components c on c.id=assessment_marks.component_id and c.school_id=assessment_marks.school_id
  join public.assessment_staff_assignments a on a.school_id=l.school_id and a.user_id=(select auth.uid()) and a.active
    and exists (select 1 from public.school_memberships sm where sm.school_id=a.school_id and sm.user_id=(select auth.uid()) and sm.active and sm.role in ('teacher','class_teacher'))
  where l.id=assessment_marks.learner_id and l.school_id=assessment_marks.school_id
    and a.grade_id=l.grade_id and (a.stream_id is null or a.stream_id=l.stream_id)
    and (a.learning_area_id is null or a.learning_area_id=c.learning_area_id)
 )
);
create policy "marks leaders insert" on public.assessment_marks for insert to authenticated
with check (public.has_school_role(school_id,array['school_owner','director','headteacher','deputy_headteacher','dos','administrator']));
create policy "marks assigned teachers insert" on public.assessment_marks for insert to authenticated
with check (
 exists (
  select 1 from public.learners l
  join public.assessment_components c on c.id=assessment_marks.component_id and c.school_id=assessment_marks.school_id
  join public.assessment_staff_assignments a on a.school_id=l.school_id and a.user_id=(select auth.uid()) and a.active
    and exists (select 1 from public.school_memberships sm where sm.school_id=a.school_id and sm.user_id=(select auth.uid()) and sm.active and sm.role in ('teacher','class_teacher'))
  where l.id=assessment_marks.learner_id and l.school_id=assessment_marks.school_id
    and a.grade_id=l.grade_id and (a.stream_id is null or a.stream_id=l.stream_id)
    and (a.learning_area_id is null or a.learning_area_id=c.learning_area_id)
 )
);
create policy "marks leaders update" on public.assessment_marks for update to authenticated
using (public.has_school_role(school_id,array['school_owner','director','headteacher','deputy_headteacher','dos','administrator']))
with check (public.has_school_role(school_id,array['school_owner','director','headteacher','deputy_headteacher','dos','administrator']));
create policy "marks assigned teachers update" on public.assessment_marks for update to authenticated
using (
 exists (
  select 1 from public.learners l
  join public.assessment_components c on c.id=assessment_marks.component_id and c.school_id=assessment_marks.school_id
  join public.assessment_staff_assignments a on a.school_id=l.school_id and a.user_id=(select auth.uid()) and a.active
    and exists (select 1 from public.school_memberships sm where sm.school_id=a.school_id and sm.user_id=(select auth.uid()) and sm.active and sm.role in ('teacher','class_teacher'))
  where l.id=assessment_marks.learner_id and l.school_id=assessment_marks.school_id
    and a.grade_id=l.grade_id and (a.stream_id is null or a.stream_id=l.stream_id)
    and (a.learning_area_id is null or a.learning_area_id=c.learning_area_id)
 )
)
with check (
 exists (
  select 1 from public.learners l
  join public.assessment_components c on c.id=assessment_marks.component_id and c.school_id=assessment_marks.school_id
  join public.assessment_staff_assignments a on a.school_id=l.school_id and a.user_id=(select auth.uid()) and a.active
    and exists (select 1 from public.school_memberships sm where sm.school_id=a.school_id and sm.user_id=(select auth.uid()) and sm.active and sm.role in ('teacher','class_teacher'))
  where l.id=assessment_marks.learner_id and l.school_id=assessment_marks.school_id
    and a.grade_id=l.grade_id and (a.stream_id is null or a.stream_id=l.stream_id)
    and (a.learning_area_id is null or a.learning_area_id=c.learning_area_id)
 )
);

-- Guardian self-service: only linked learners and finalised result snapshots/marks.
drop policy if exists "guardians read own profile" on public.guardians;
create policy "guardians read own profile" on public.guardians for select to authenticated using (auth_user_id=(select auth.uid()));
drop policy if exists "guardians read own learner links" on public.learner_guardians;
create policy "guardians read own learner links" on public.learner_guardians for select to authenticated
using (exists(select 1 from public.guardians g where g.id=learner_guardians.guardian_id and g.auth_user_id=(select auth.uid())));
drop policy if exists "guardians read linked learners" on public.learners;
create policy "guardians read linked learners" on public.learners for select to authenticated
using (exists(
 select 1 from public.learner_guardians lg join public.guardians g on g.id=lg.guardian_id
 where lg.learner_id=learners.id and lg.school_id=learners.school_id
 and g.auth_user_id=(select auth.uid()) and lg.can_receive_academic_updates
));
drop policy if exists "guardians read final marks" on public.assessment_marks;
create policy "guardians read final marks" on public.assessment_marks for select to authenticated
using (
 exists(
  select 1 from public.learner_guardians lg join public.guardians g on g.id=lg.guardian_id
  join public.school_assessments a on a.id=assessment_marks.assessment_id and a.school_id=assessment_marks.school_id
  where lg.learner_id=assessment_marks.learner_id and lg.school_id=assessment_marks.school_id
   and g.auth_user_id=(select auth.uid()) and lg.can_receive_academic_updates
   and a.status in ('approved','locked')
 )
);
drop policy if exists "guardians read linked report snapshots" on public.report_card_snapshots;
create policy "guardians read linked report snapshots" on public.report_card_snapshots for select to authenticated
using (
 exists(select 1 from public.learner_guardians lg join public.guardians g on g.id=lg.guardian_id
  where lg.learner_id=report_card_snapshots.learner_id and lg.school_id=report_card_snapshots.school_id
   and g.auth_user_id=(select auth.uid()) and lg.can_receive_academic_updates)
);


drop policy if exists "guardians read approved assessments" on public.school_assessments;
create policy "guardians read approved assessments" on public.school_assessments for select to authenticated
using (
 status in ('approved','locked') and exists(
  select 1 from public.learner_guardians lg join public.guardians g on g.id=lg.guardian_id
  where lg.school_id=school_assessments.school_id and lg.can_receive_academic_updates
   and g.auth_user_id=(select auth.uid())
 )
);

commit;
