-- DIGITAL SCHOOL CENTRE V6.5 DEVELOPMENT HARDENING
-- Apply ONLY after corrected migrations 001-005 on a NEW V6 development database.
-- This is a hardening layer, not a declaration of production readiness.

-- 1) Teacher access is limited to learning areas assigned to their own staff profile.
-- Class-teacher-specific class assignment is deliberately not granted until a dedicated
-- class_teacher_assignments table/workflow exists.
create or replace function public.can_access_assessment_component(
  p_school_id uuid, p_assessment_id uuid, p_component_id uuid
) returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select
    public.is_school_member(p_school_id)
    and (
      public.has_school_role(p_school_id, array['school_owner','director','headteacher','deputy_headteacher','dos','administrator','registrar'])
      or exists (
      select 1
      from public.staff_profiles sp
      join public.teacher_learning_areas tla
        on tla.teacher_id = sp.id and tla.school_id = sp.school_id and tla.qualified = true
      join public.assessment_components ac
        on ac.learning_area_id = tla.learning_area_id and ac.school_id = tla.school_id
      where sp.school_id = p_school_id
        and sp.auth_user_id = auth.uid()
        and sp.active = true
        and ac.id = p_component_id
        and ac.assessment_id = p_assessment_id
      )
    );
$$;
revoke all on function public.can_access_assessment_component(uuid,uuid,uuid) from public;
grant execute on function public.can_access_assessment_component(uuid,uuid,uuid) to authenticated;

-- Replace school-wide teacher access to individual marks with assignment-scoped access.
drop policy if exists "marks authorised staff read" on public.assessment_marks;
drop policy if exists "marks authorised staff insert" on public.assessment_marks;
drop policy if exists "marks authorised staff update" on public.assessment_marks;
create policy "marks assigned staff read" on public.assessment_marks
for select to authenticated using (
  public.can_access_assessment_component(school_id, assessment_id, component_id)
);
create policy "marks assigned staff insert" on public.assessment_marks
for insert to authenticated with check (
  public.can_access_assessment_component(school_id, assessment_id, component_id)
  and entered_by = auth.uid()
);
create policy "marks assigned staff update" on public.assessment_marks
for update to authenticated using (
  public.can_access_assessment_component(school_id, assessment_id, component_id)
) with check (
  public.can_access_assessment_component(school_id, assessment_id, component_id)
  and entered_by = auth.uid()
);

-- 2) Enforce parent assessment/component/learner consistency and protect finalised marks.
create or replace function public.guard_assessment_mark_integrity()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_status text; v_component_assessment uuid; v_assessment_grade uuid; v_learner_grade uuid;
begin
  if tg_op = 'UPDATE' then
    -- Do not allow a mark to be moved out of a finalised assessment.
    select status into v_status from public.school_assessments where id = old.assessment_id and school_id = old.school_id;
    if v_status in ('approved','locked','archived') then
      raise exception 'Marks in approved, locked or archived assessments cannot be moved';
    end if;
  end if;
  if tg_op = 'DELETE' then
    select status into v_status from public.school_assessments where id = old.assessment_id and school_id = old.school_id;
    if v_status in ('approved','locked','archived') then
      raise exception 'Approved, locked or archived assessment marks cannot be deleted';
    end if;
    return old;
  end if;
  select status, grade_id into v_status, v_assessment_grade
    from public.school_assessments where id = new.assessment_id and school_id = new.school_id;
  if not found then raise exception 'Assessment does not exist in this school'; end if;
  select assessment_id into v_component_assessment from public.assessment_components
    where id = new.component_id and school_id = new.school_id;
  if v_component_assessment is distinct from new.assessment_id then
    raise exception 'Selected component does not belong to this assessment';
  end if;
  select grade_id into v_learner_grade from public.learners
    where id = new.learner_id and school_id = new.school_id;
  if not found then raise exception 'Learner does not exist in this school'; end if;
  if v_assessment_grade is not null and v_learner_grade is distinct from v_assessment_grade then
    raise exception 'Learner is not in the assessment grade';
  end if;
  if v_status in ('approved','locked','archived') then
    raise exception 'Approved, locked or archived assessment marks cannot be changed';
  end if;
  if v_status <> 'open' and not public.has_school_role(new.school_id,array['school_owner','director','headteacher','deputy_headteacher','dos','administrator']) then
    raise exception 'Marks can only be entered while the assessment is open';
  end if;
  new.entered_by := coalesce(new.entered_by, auth.uid());
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_guard_locked_assessment_marks on public.assessment_marks;
drop trigger if exists trg_guard_assessment_mark_integrity on public.assessment_marks;
create trigger trg_guard_assessment_mark_integrity
before insert or update or delete on public.assessment_marks
for each row execute function public.guard_assessment_mark_integrity();

-- 3) Assessment lifecycle must not be bypassed with a direct table UPDATE.
drop policy if exists "assessment admins update" on public.school_assessments;
revoke update on public.school_assessments from authenticated;
grant select, insert on public.school_assessments to authenticated;
create or replace function public.set_assessment_status(p_assessment_id uuid, p_status text)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare a public.school_assessments%rowtype; allowed boolean := false;
begin
  select * into a from public.school_assessments where id = p_assessment_id for update;
  if not found then raise exception 'Assessment not found'; end if;
  if not public.is_school_member(a.school_id) then raise exception 'Not authorised'; end if;
  allowed := (a.status = 'draft' and p_status = 'open')
    or (a.status = 'open' and p_status = 'submitted')
    or (a.status = 'submitted' and p_status = 'moderation')
    or (a.status = 'moderation' and p_status = 'approved')
    or (a.status = 'approved' and p_status = 'locked')
    or (a.status in ('approved','locked') and p_status = 'archived');
  if not allowed then raise exception 'Invalid assessment transition: % -> %', a.status, p_status; end if;
  if p_status in ('approved','locked','archived') and not public.has_school_role(a.school_id,array['school_owner','director','headteacher','administrator']) then
    raise exception 'Only authorised school leadership may approve, lock or archive results';
  end if;
  if p_status in ('submitted','moderation') and not public.has_school_role(a.school_id,array['school_owner','director','headteacher','deputy_headteacher','dos','administrator','teacher']) then
    raise exception 'Not authorised to submit or moderate results';
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

-- Components may only be edited while the parent assessment is draft/open.
create or replace function public.guard_assessment_component_state()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare aid uuid; st text;
begin
  aid := case when tg_op='DELETE' then old.assessment_id else new.assessment_id end;
  select status into st from public.school_assessments where id=aid;
  if st is distinct from 'draft' and st is distinct from 'open' then
    raise exception 'Assessment components are frozen after submission';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists trg_guard_assessment_component_state on public.assessment_components;
create trigger trg_guard_assessment_component_state
before insert or update or delete on public.assessment_components
for each row execute function public.guard_assessment_component_state();

-- 4) Report snapshots are append-only. Corrections require a new versioned workflow,
-- not an UPDATE that silently overwrites the historical report.
drop policy if exists "report snapshots admin update" on public.report_card_snapshots;
revoke update, delete on public.report_card_snapshots from authenticated;
grant select, insert on public.report_card_snapshots to authenticated;

-- 5) Timetable versions are changed by trusted functions, not direct browser updates.
-- Existing admin insert/select policies remain. Validation and publication are RPC-only.
drop policy if exists timetable_versions_admin_update on public.timetable_versions;
revoke update, delete on public.timetable_versions from authenticated;
grant select, insert on public.timetable_versions to authenticated;

-- IMPORTANT LIMITATIONS TO CLOSE BEFORE PRODUCTION:
-- * This patch does not implement an automatic timetable solver or drag/drop editor.
-- * Class-teacher-specific assignments and parent/learner access still need dedicated tables/RPCs.
-- * The operations UI currently assumes a single active school membership and loads school-level
--   lists; do not expose it to teacher accounts until its queries are role-aware.
-- * Snapshot PDF layout, amendment/version workflow, audit coverage and two-tenant tests remain.
