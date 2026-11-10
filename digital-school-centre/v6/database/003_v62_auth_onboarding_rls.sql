-- DIGITAL SCHOOL CENTRE V6.2: secure onboarding and academic-core policies
-- Apply AFTER 001_v6_foundation.sql and 002_v61_tenant_integrity.sql.
-- Test in a fresh development Supabase project. Review with your security lead before production.

-- Remove the foundation's broad membership read policies. More restrictive policies follow.
drop policy if exists "school members read school" on public.schools;
drop policy if exists "school members read memberships" on public.school_memberships;
drop policy if exists "school members read campuses" on public.campuses;
drop policy if exists "school members read years" on public.academic_years;
drop policy if exists "school members read terms" on public.academic_terms;
drop policy if exists "school members read grades" on public.school_grades;
drop policy if exists "school members read streams" on public.school_streams;
drop policy if exists "school members read rooms" on public.rooms;
drop policy if exists "school members read curriculum" on public.curriculum_versions;
drop policy if exists "school members read learning areas" on public.learning_areas;
drop policy if exists "school members read staff" on public.staff_profiles;
drop policy if exists "school members read teacher areas" on public.teacher_learning_areas;
drop policy if exists "school members read learners" on public.learners;
drop policy if exists "school members read guardians" on public.guardians;
drop policy if exists "school members read learner guardians" on public.learner_guardians;
drop policy if exists "school members read assessment profiles" on public.assessment_profiles;
drop policy if exists "school members read assessments" on public.assessments;
drop policy if exists "school members read results" on public.assessment_results;
drop policy if exists "school leaders read audit" on public.audit_events;

-- A user may only see their own membership rows. Membership provisioning is trusted-server only.
create policy "users read own memberships" on public.school_memberships
for select to authenticated using (user_id = auth.uid());

create policy "members read own school" on public.schools
for select to authenticated using (public.is_school_member(id));

create policy "school leaders update school profile" on public.schools
for update to authenticated
using (public.has_school_role(id,array['school_owner','director','headteacher']))
with check (public.has_school_role(id,array['school_owner','director','headteacher']));

-- Tenant-scoped read/write helper policies for school setup and academic administration.
do $$
declare t text;
begin
  foreach t in array array[
    'campuses','academic_years','academic_terms','school_grades','school_streams',
    'rooms','curriculum_versions','learning_areas','staff_profiles','teacher_learning_areas',
    'assessment_profiles','assessments'
  ] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_school_member(school_id))', t||'_member_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.has_school_role(school_id,array[''school_owner'',''director'',''headteacher'',''deputy_headteacher'',''dos'',''administrator'',''registrar'']))', t||'_academic_admin_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.has_school_role(school_id,array[''school_owner'',''director'',''headteacher'',''deputy_headteacher'',''dos'',''administrator'',''registrar''])) with check (public.has_school_role(school_id,array[''school_owner'',''director'',''headteacher'',''deputy_headteacher'',''dos'',''administrator'',''registrar'']))', t||'_academic_admin_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.has_school_role(school_id,array[''school_owner'',''director'',''headteacher'',''administrator'']))', t||'_school_admin_delete', t);
  end loop;
end $$;

-- Staff profiles contain personal information: restrict reads to authorised school roles.
drop policy if exists "staff_profiles_member_read" on public.staff_profiles;
create policy "authorised roles read staff profiles" on public.staff_profiles
for select to authenticated using (public.has_school_role(school_id,array[
 'school_owner','director','headteacher','deputy_headteacher','dos','administrator','registrar'
]));

-- Learner and guardian data is restricted to school leadership, registrar and authorised academic office.
create policy "authorised staff read learners" on public.learners
for select to authenticated using (public.has_school_role(school_id,array[
 'school_owner','director','headteacher','deputy_headteacher','dos','administrator','registrar'
]));
create policy "registrars create learners" on public.learners
for insert to authenticated with check (public.has_school_role(school_id,array[
 'school_owner','director','headteacher','deputy_headteacher','administrator','registrar'
]));
create policy "registrars update learners" on public.learners
for update to authenticated using (public.has_school_role(school_id,array[
 'school_owner','director','headteacher','deputy_headteacher','administrator','registrar'
])) with check (public.has_school_role(school_id,array[
 'school_owner','director','headteacher','deputy_headteacher','administrator','registrar'
]));
create policy "school leaders delete learners" on public.learners
for delete to authenticated using (public.has_school_role(school_id,array['school_owner','director','headteacher','administrator']));

create policy "authorised staff read guardians" on public.guardians
for select to authenticated using (public.has_school_role(school_id,array[
 'school_owner','director','headteacher','deputy_headteacher','administrator','registrar'
]));
create policy "registrars create guardians" on public.guardians
for insert to authenticated with check (public.has_school_role(school_id,array[
 'school_owner','director','headteacher','administrator','registrar'
]));
create policy "registrars update guardians" on public.guardians
for update to authenticated using (public.has_school_role(school_id,array[
 'school_owner','director','headteacher','administrator','registrar'
])) with check (public.has_school_role(school_id,array[
 'school_owner','director','headteacher','administrator','registrar'
]));
create policy "school leaders delete guardians" on public.guardians
for delete to authenticated using (public.has_school_role(school_id,array['school_owner','director','headteacher','administrator']));

create policy "authorised staff read learner guardian links" on public.learner_guardians
for select to authenticated using (public.has_school_role(school_id,array[
 'school_owner','director','headteacher','deputy_headteacher','administrator','registrar'
]));
create policy "registrars manage learner guardian links" on public.learner_guardians
for all to authenticated
using (public.has_school_role(school_id,array['school_owner','director','headteacher','administrator','registrar']))
with check (public.has_school_role(school_id,array['school_owner','director','headteacher','administrator','registrar']));

-- Teachers may read only learner assessment data only after assignment-scoped policies are built.
-- For now assessment result access is limited to school leadership/academic office.
create policy "academic leaders read results" on public.assessment_results
for select to authenticated using (public.has_school_role(school_id,array[
 'school_owner','director','headteacher','deputy_headteacher','dos','administrator','registrar'
]));
create policy "academic leaders insert results" on public.assessment_results
for insert to authenticated with check (public.has_school_role(school_id,array[
 'school_owner','director','headteacher','deputy_headteacher','dos','administrator'
]));
create policy "academic leaders update results" on public.assessment_results
for update to authenticated using (public.has_school_role(school_id,array[
 'school_owner','director','headteacher','deputy_headteacher','dos','administrator'
])) with check (public.has_school_role(school_id,array[
 'school_owner','director','headteacher','deputy_headteacher','dos','administrator'
]));
create policy "school leaders delete results" on public.assessment_results
for delete to authenticated using (public.has_school_role(school_id,array['school_owner','director','headteacher']));

create policy "school leaders read audit events" on public.audit_events
for select to authenticated using (public.has_school_role(school_id,array['school_owner','director','headteacher','auditor']));

-- Secure self-service school onboarding: the caller can create a school and become its first owner.
-- The browser cannot choose a role or add another user's membership.
create or replace function public.create_school_workspace(
  p_legal_name text,
  p_display_name text,
  p_slug text,
  p_school_type text default 'private',
  p_school_model text default 'day',
  p_county text default null,
  p_sub_county text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare new_school_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if length(trim(coalesce(p_legal_name,''))) < 3
     or length(trim(coalesce(p_display_name,''))) < 2 then
    raise exception 'Enter a valid school name';
  end if;
  if p_slug !~ '^[a-z0-9][a-z0-9-]{2,49}$' then
    raise exception 'School URL name must be 3-50 lowercase letters, numbers or hyphens';
  end if;
  if exists(select 1 from public.school_memberships where user_id=auth.uid() and active=true) then
    raise exception 'This account already belongs to a school. Ask the platform administrator to provision additional schools.';
  end if;
  insert into public.schools(legal_name,display_name,slug,school_type,school_model,county,sub_county)
  values(trim(p_legal_name),trim(p_display_name),p_slug,p_school_type,p_school_model,p_county,p_sub_county)
  returning id into new_school_id;

  insert into public.school_memberships(school_id,user_id,role,active)
  values(new_school_id,auth.uid(),'school_owner',true);

  insert into public.audit_events(school_id,actor_user_id,action,entity_table,entity_id,reason)
  values(new_school_id,auth.uid(),'school_workspace_created','schools',new_school_id::text,'First owner self-service onboarding');

  return new_school_id;
end;
$$;

revoke all on function public.create_school_workspace(text,text,text,text,text,text,text) from public;
grant execute on function public.create_school_workspace(text,text,text,text,text,text,text) to authenticated;

-- Prevent authenticated clients from changing memberships directly.
revoke insert, update, delete on public.school_memberships from authenticated;

-- Do not grant direct public access to tenant data tables. RLS policies govern authenticated access.
