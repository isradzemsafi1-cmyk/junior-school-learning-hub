# Digital School Centre — product roadmap

## Product vision
A school-neutral, multi-tenant school management platform serving Pre-Primary, Primary, Junior School and Senior School. Each subscribed school manages its own data, users, academic calendar and configuration. A central platform-owner console manages subscriptions and support without exposing school learner records.

## Core modules
1. School onboarding and organisation
2. Learners, guardians and admissions
3. Teachers, staff and workload
4. Curriculum and academic planning
5. Whole-school timetable and room scheduling
6. Teacher Daily Occurrence Book
7. Attendance
8. Assessment, examinations and marks
9. Analysis, rankings, graphs and merit lists
10. Learner report forms and batch reporting
11. Finance, fees and payment reconciliation
12. Parent/learner portal and communications
13. Library, inventory and assets
14. Governance, privacy, audit and backup
15. Multi-school subscriptions and platform-owner console

## Teacher Daily Occurrence Book — required production workflow
Each entry should capture:
- School, campus, academic year/term and date
- Teacher identity (linked to staff record)
- Grade, stream, learning area and lesson/period
- Attendance status or attendance reference
- Work covered / teaching activity (past tense)
- Occurrence category and factual observation
- Action taken, responsible person and follow-up date
- Follow-up status
- Teacher declaration and timestamp
- Reviewer/headteacher remarks, review status and timestamp

Production rules:
- Link teacher, class/stream and learning area to authorised assignments.
- Save each entry in the school database and preserve edit history.
- Teachers can create entries for their assigned classes; authorised leaders can review.
- Restrict sensitive safeguarding, health or discipline details to explicitly authorised roles.
- Avoid recording unnecessary sensitive personal details in the general occurrence book; use a separate restricted case workflow when required.
- Support daily, weekly, teacher, stream and school-level summaries.
- Export approved records to PDF/CSV; keep an audit log of edits and exports.
- Do not silently delete approved entries; corrections should create a traceable amendment.

## Timetable production requirements
Hard constraints:
- No teacher, stream/class or room double-booking.
- Respect teacher availability and workload ceilings.
- Match the required weekly lesson count for each learning area and stream.
- Respect lesson duration, school day, breaks and lunch.
- Enforce room type/capacity and double-period requirements.

Soft constraints:
- Spread learning areas across the week.
- Balance teacher daily load and avoid unnecessary gaps.
- Avoid excessive consecutive demanding lessons.
- Place practical lessons in suitable rooms.
- Minimise last-minute substitutions and timetable disruption.

Outputs:
- Whole-school master timetable
- Individual stream timetable
- Individual teacher timetable
- Room timetable
- Teacher workload summary
- Unassigned lesson and clash report
- Version history, approval and publication workflow

## Examination/reporting engine
- One approved result snapshot should drive graphs, rankings and learner reports.
- Support configurable grading scales by curriculum and academic year.
- School, grade, stream, learning-area and learner analysis.
- Merit lists with documented tie handling and publication controls.
- Strand/sub-strand analysis when supported by assessment design.
- Report cards with achievement, comments, attendance and next steps.
- Batch PDF and spreadsheet export.
- Moderation, approval, locking and audited reopening.

## Implementation sequence
Phase 1: tenant-safe foundation, authentication, school setup, grades/streams, learners, guardians, staff and learning areas.
Phase 2: timetable, teacher workload, rooms, Daily Occurrence Book and attendance.
Phase 3: assessments, marks, moderation, analysis, merit lists and reports.
Phase 4: fees, M-Pesa reconciliation, receipts and parent portal.
Phase 5: curriculum planning, library, inventory, communications and advanced operations.
Phase 6: multi-campus, offline-friendly workflows, integrations, subscription billing and scale testing.

## Definition of ready for production
- Two pilot schools cannot access each other's records.
- Teacher and parent roles are scoped and tested.
- All critical records persist in a database.
- Daily occurrence records are reviewable and auditable.
- Timetable hard clashes are prevented and unplaced lessons are explained.
- Marks and reports are reproducible from approved snapshots.
- Payments are idempotent and reconciled.
- Backups and restore are tested.
- Privacy, security and child-data obligations have been reviewed.
