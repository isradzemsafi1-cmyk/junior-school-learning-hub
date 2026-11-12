# Digital School Centre V6 — Delivery Roadmap

| Release | Scope | Completion evidence |
|---|---|---|
| V6.0 | Architecture, all-level model, initial schema, KJSEA profile, browser foundation preview | V6 package and documented scope |
| V6.1 preview | Local academic core: academic years/terms, grades/streams, staff, learners, learning areas, local persistence and CSV export; tenant-integrity migration | Functional local preview; Node syntax check; database migration prepared but not applied to a live project |
| V6.1 | Authentication, school onboarding, tenant-safe academic core | Two isolated test tenants; CRUD, imports and audit logs |
| V6.2 | Timetable engine | Constraint tests, clash report, workload and published schedule versions |
| V6.3 | Assessments and analysis | Mark moderation, locked snapshots, CBC evidence and report exports |
| V6.4 | Finance and M-Pesa | Reconciled learner accounts, duplicate-safe callbacks, financial audit trail |
| V6.5 | Portals and operations | Teacher/parent/learner access, communications, library, inventory and optional modules |
| V6.6 | Production readiness | Security/privacy review, restore drill, load/accessibility tests and pilot sign-off |

## Immediate next implementation sequence
1. Create a separate Supabase development project and apply the V6 foundation migration.
2. Build trusted tenant onboarding (platform operator creates school; first owner is assigned securely).
3. Add tenant-consistent foreign keys and complete role/assignment-specific RLS for all CRUD operations.
4. Implement school setup and academic core against the database, replacing browser-local demo storage.
5. Build automated test fixtures for two schools and prove cross-tenant isolation.
6. Proceed to timetable service and assessment workflows.

## Scope guardrails
- Do not merge V6 into the V5 production website until preview, database and rollback are tested.
- Do not use real learner data in the local preview.
- Do not treat the starter SQL as production complete.
- Do not advertise KNEC/NEMIS integration unless authorised access exists.


## V6.2 implementation milestone
A Supabase-connected client entry point (`app/live.html`) and migration `003_v62_auth_onboarding_rls.sql` are now included. The user must configure a separate development Supabase project and public client key. No remote project was connected or migrated in this session.


## V6.3 timetable + exam-analysis preview
- Added `app/academic-operations.html` with local timetable setup, automatic conflict-avoiding draft generation, class/teacher/room/master views, unplaced lesson report, manual and CSV examination marks entry, performance statistics, ranking and CSV exports.
- Added `database/004_v63_timetable_engine.sql` for school-scoped timetable templates, periods, teacher availability, requirements, versions and entries.
- The timetable and exam preview is not yet connected to Supabase. Production solver optimisation, fixed commitments, teacher qualification/availability rules, atomic publish, approval/locking and full CBC evidence remain future implementation gates.


## V6.4 delivered
- Live assessment schema for numeric and competency evidence
- Assessment moderation, approval and locked-result lifecycle
- Report-card snapshot storage
- Server-side timetable clash validation before publishing

## Remaining before production
- Full live UI integration and PDF report-card renderer
- Teacher/class assignment scoping and availability/qualification constraints in the scheduler service
- Two-tenant penetration/RLS tests, audit coverage, backup/restore and privacy review
