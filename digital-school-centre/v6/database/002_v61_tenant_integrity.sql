-- V6.1 tenant-integrity hardening.
-- Apply after 001_v6_foundation.sql in a development database.
-- Composite foreign keys ensure related records belong to the same school.

alter table public.campuses add constraint campuses_id_school_unique unique(id,school_id);
alter table public.academic_years add constraint academic_years_id_school_unique unique(id,school_id);
alter table public.academic_terms add constraint academic_terms_id_school_unique unique(id,school_id);
alter table public.school_grades add constraint school_grades_id_school_unique unique(id,school_id);
alter table public.school_streams add constraint school_streams_id_school_unique unique(id,school_id);
alter table public.rooms add constraint rooms_id_school_unique unique(id,school_id);
alter table public.curriculum_versions add constraint curriculum_versions_id_school_unique unique(id,school_id);
alter table public.learning_areas add constraint learning_areas_id_school_unique unique(id,school_id);
alter table public.staff_profiles add constraint staff_profiles_id_school_unique unique(id,school_id);
alter table public.learners add constraint learners_id_school_unique unique(id,school_id);
alter table public.guardians add constraint guardians_id_school_unique unique(id,school_id);
alter table public.assessments add constraint assessments_id_school_unique unique(id,school_id);

alter table public.staff_profiles
  add constraint staff_campus_same_school
  foreign key (campus_id,school_id) references public.campuses(id,school_id)
  on delete set null (campus_id);
alter table public.learners
  add constraint learners_campus_same_school
  foreign key (campus_id,school_id) references public.campuses(id,school_id)
  on delete set null (campus_id);
alter table public.learning_areas
  add constraint learning_areas_curriculum_same_school
  foreign key (curriculum_version_id,school_id) references public.curriculum_versions(id,school_id)
  on delete set null (curriculum_version_id);
alter table public.academic_terms
  add constraint academic_terms_year_same_school
  foreign key (academic_year_id,school_id) references public.academic_years(id,school_id)
  on delete cascade;
alter table public.school_streams
  add constraint school_streams_grade_same_school
  foreign key (grade_id,school_id) references public.school_grades(id,school_id)
  on delete cascade;
alter table public.teacher_learning_areas
  add constraint teacher_learning_areas_teacher_same_school
  foreign key (teacher_id,school_id) references public.staff_profiles(id,school_id)
  on delete cascade;
alter table public.teacher_learning_areas
  add constraint teacher_learning_areas_area_same_school
  foreign key (learning_area_id,school_id) references public.learning_areas(id,school_id)
  on delete cascade;
alter table public.learners
  add constraint learners_grade_same_school
  foreign key (grade_id,school_id) references public.school_grades(id,school_id)
  on delete set null (grade_id);
alter table public.learners
  add constraint learners_stream_same_school
  foreign key (stream_id,school_id) references public.school_streams(id,school_id)
  on delete set null (stream_id);
alter table public.learner_guardians
  add constraint learner_guardians_learner_same_school
  foreign key (learner_id,school_id) references public.learners(id,school_id)
  on delete cascade;
alter table public.learner_guardians
  add constraint learner_guardians_guardian_same_school
  foreign key (guardian_id,school_id) references public.guardians(id,school_id)
  on delete cascade;
alter table public.assessments
  add constraint assessments_year_same_school
  foreign key (academic_year_id,school_id) references public.academic_years(id,school_id)
  on delete set null (academic_year_id);
alter table public.assessments
  add constraint assessments_term_same_school
  foreign key (term_id,school_id) references public.academic_terms(id,school_id)
  on delete set null (term_id);
alter table public.assessments
  add constraint assessments_grade_same_school
  foreign key (grade_id,school_id) references public.school_grades(id,school_id)
  on delete set null (grade_id);
alter table public.assessment_results
  add constraint results_assessment_same_school
  foreign key (assessment_id,school_id) references public.assessments(id,school_id)
  on delete cascade;
alter table public.assessment_results
  add constraint results_learner_same_school
  foreign key (learner_id,school_id) references public.learners(id,school_id)
  on delete cascade;
alter table public.assessment_results
  add constraint results_learning_area_same_school
  foreign key (learning_area_id,school_id) references public.learning_areas(id,school_id)
  on delete restrict;

-- These constraints prevent accidental cross-school references even when an
-- authorised server-side process writes the rows. RLS and role checks remain
-- independently mandatory. No broad client write policies are created here.
