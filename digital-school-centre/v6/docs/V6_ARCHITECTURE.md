# Digital School Centre V6 — Architecture Specification

**Product scope:** Kenya-first, multi-tenant school operating platform covering Pre-primary, Primary, Junior School and Senior School, with configurable stage-based/SNE and alternative-curriculum support.

## Product principles
1. One authoritative learner, guardian, staff, class, stream, curriculum and academic-period record powers every workflow.
2. School tenancy is enforced in PostgreSQL Row Level Security and server-side authorisation, not just front-end filtering.
3. Curriculum and assessment profiles are versioned by effective date/academic year. Schools activate only the levels and pathways they offer.
4. A report or analysis is reproducible from an approved assessment snapshot.
5. Sensitive child, health and safeguarding data are minimised and restricted to specifically authorised roles.
6. Every privileged action is attributable and auditable.
7. Low-bandwidth, mobile-first, print/export and retry-safe workflows are first-class requirements.

## Education coverage
- Pre-primary: PP1, PP2.
- Lower Primary: Grades 1–3.
- Upper Primary: Grades 4–6.
- Junior School: Grades 7–9.
- Senior School: Grades 10–12, with pathway and subject-combination configuration.
- Stage-based / SNE: configurable stage, individual learning plan and approved accommodations.
- Alternative curricula: separately versioned subjects, assessment profiles and report templates.

Do not hard-code one universal subject list. Import or configure curriculum designs from the relevant current KICD version and keep historical versions for old learner cohorts.

## Bounded modules
1. Platform owner, school subscriptions and support.
2. School profile, campuses, academic years, terms, calendar and configuration.
3. Admissions, learner records, guardian relationships, transfers and alumni.
4. Staff directory, qualifications, departments, workload, leave and payroll-ready records.
5. Grades, streams, learning areas, rooms, houses and facilities.
6. Curriculum mapping, schemes of work, lesson plans, lesson coverage and assignments.
7. Timetable, availability, room scheduling, duties and substitutions.
8. Learner and staff attendance.
9. Assessment setup, papers, mark entry, rubrics, moderation, approval and locking.
10. Analysis, merit lists, trends, intervention tracking and report cards.
11. Fees, invoices, receipts, bursaries, expenses, budgets and reconciliation.
12. M-Pesa integration with verified callbacks and idempotent payment processing.
13. Parent and learner portals, messaging and delivery logs.
14. Library, inventory, procurement, assets and maintenance.
15. Transport, boarding and meals (optional by school).
16. Discipline, guidance, welfare and safeguarding with restricted access.
17. Audit, privacy, consent/notice records, data requests, exports and retention.
18. Offline/PWA sync and operational monitoring.

## Core workflow design
### School onboarding
Platform operator creates school tenant -> trusted onboarding function assigns first owner -> school owner configures campus and academic year -> activates stages/grades/streams -> adds curriculum versions and learning areas -> imports staff/learners with validation preview -> maps roles and assignments.

### Timetable
Inputs: days, period templates, breaks, lunch, lesson duration, teacher qualifications/availability/workload, class weekly demand, room type/capacity, practical/double-period requirements and fixed events.
Hard constraints: no teacher/class/room double-booking; availability; school hours; protected breaks; qualified teacher; room compatibility; required weekly totals.
Soft objectives: subject spread, avoid repeat overload, balanced teacher daily load, fewer teacher gaps, sensible first/last periods and preferred double lessons.
Output: draft master, class, teacher and room timetables; conflict report; unplaced lessons; workload report. Manual moves must revalidate. Publish immutable version and notify affected users.
The V5 browser-only greedy generator is a prototype, not a production optimiser. V6 should use a constraint solver/service and persist versioned schedules.

### Assessment and analysis
Assessment setup -> define curriculum/grade/stream/learning areas/items and scoring profile -> mark entry -> validate range/missing values -> moderation -> approval -> immutable locked snapshot -> analysis and report cards.
Numerical marks, CBE achievement descriptors, rubric evidence and learner work samples must remain distinct data types. Do not force every learning area into a percentage.
Analysis filters: year, term, assessment, stage, grade, stream, learning area, learner group, curriculum and assessment profile.
Metrics: assessed count/denominator, completion, mean, median, distribution, highest/lowest, standard deviation, configured achievement bands, strand/sub-strand evidence and term trends. Every graph labels metric, cohort, time period and denominator.
Merit lists are optional school-configured views; tie handling and publication permissions are explicit. Public learner leaderboards are off by default.
KJSEA subject-level points must not be combined into a simple aggregate. Pathway-related reporting is separate and must follow KNEC rules.

### KJSEA 2025 grading reference
Official KNEC Regulations, section 13.2:
- EE1 90–100 = 8 points
- EE2 75–89 = 7 points
- ME1 58–74 = 6 points
- ME2 41–57 = 5 points
- AE1 31–40 = 4 points
- AE2 21–30 = 3 points
- BE1 11–20 = 2 points
- BE2 0–10 = 1 point
The supplied poster differs at the endpoints (90–99 and 1–10). The official regulation is the implementation source. The profile must be versioned, source-linked and never silently applied to unrelated internal assessments.

## Recommended technical architecture
- Frontend: responsive TypeScript web app/PWA with role-specific workspaces and accessible components.
- Backend: trusted API/server functions for privileged workflows, input validation, imports, report generation and integrations.
- Data: Supabase PostgreSQL, object storage with private buckets and signed URLs, RLS on every tenant-owned table.
- Authentication: Supabase Auth, MFA for privileged roles, recovery, session controls and account lifecycle.
- Integrations: Safaricom Daraja (only with approved credentials), SMS/email provider, PDF/Excel generation; no claimed KNEC/NEMIS integration without authorised documented interfaces.
- Observability: structured logs, audit events, error monitoring, backup/restore drills and idempotency keys.

## Security and data protection
- Tenant ownership is established by membership records and trusted server functions. Never permit self-assignment of privileged roles.
- RLS must cover SELECT, INSERT, UPDATE and DELETE policies; teacher assignment scope and parent-to-learner links require separate policies.
- Sensitive medical, disability and safeguarding data should be separate restricted tables or encrypted fields with narrow role grants and access logs.
- Use purpose limitation, data minimisation, accuracy, retention schedules, privacy notices, appropriate guardian/child rights workflows, breach response and DPIA review where required.
- Do not store payment credentials, provider secrets or Supabase service-role keys in browser code.
- Enforce school-consistent foreign keys or triggers so a record from one tenant cannot be linked to another tenant's learner, staff, grade or assessment.
- Validate imports, preview changes, detect duplicates and support rollback.
- Backups are not enough: test restores and document recovery objectives.

## Phased delivery
### V6.0 foundation (this package)
- Product architecture and module boundaries.
- Full education-level model.
- Initial multi-tenant database foundation.
- KJSEA 2025 reference profile.
- Local browser prototype for school setup, stage overview, module map and grading calculator.

### V6.1 academic core
- Real auth and school onboarding.
- Complete tenant-safe write policies and trusted onboarding.
- Campuses, years, terms, grades, streams, learning areas, staff, learners and guardians.
- CSV/XLSX import with preview and duplicate controls.

### V6.2 timetable
- Constraint-based scheduling service.
- Period templates, availability, room inventory, workload, clash validation, versioning and publishing.

### V6.3 assessment and reporting
- Assessment workflows, moderation, approval/locking, CBE evidence, configurable grading, analysis and report snapshots.

### V6.4 finance and integrations
- Fee billing, receipts, expenses, accounting controls, M-Pesa idempotency and reconciliation.

### V6.5 portals and school operations
- Parent/learner/teacher portals, messaging, library, inventory, transport/boarding and offline sync.

### V6.6 production readiness
- Independent security review, privacy review, load tests, accessibility, backup/restore tests, pilot acceptance and deployment runbooks.

## Acceptance gates before real school data
- Two tenant schools cannot read or mutate each other's records.
- A teacher sees only assigned classes and learning areas.
- A parent sees only linked learner records and permitted information.
- No hard timetable clash can be published; all unplaced lessons are visible.
- Approved marks cannot be silently changed; reopening requires reason and permission.
- Reports and analysis reproduce from the same locked result snapshot.
- KJSEA grade boundaries are tested at every boundary (0, 10, 11, 20, 21, 30, 31, 40, 41, 57, 58, 74, 75, 89, 90, 100).
- Payment callbacks are signature/credential verified and idempotent.
- Backups restore successfully into a test environment.
- Privacy notices, retention and child-data controls have been reviewed before production.
