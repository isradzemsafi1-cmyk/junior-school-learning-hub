# Digital School Centre V5 — Deployment guide

## What this package is
This ZIP contains the updated front-end preview and implementation documents. It is not yet connected to a production database and it has not been deployed to the live domain.

## Tomorrow's safe publishing workflow
1. Download and extract this ZIP.
2. Open the existing Digital School Centre GitHub repository.
3. Create a new branch, for example `digital-school-centre-v5`.
4. Upload/replace the project files on that branch. Keep the existing repository configuration and deployment files unless the project owner has reviewed the changes.
5. Open `index.html` locally and test the Daily Occurrence Book, timetable setup, analysis screens and navigation.
6. Commit the changes with a clear message such as `Add timetable builder and teacher daily occurrence book`.
7. Open a Pull Request into `main`.
8. Wait for Netlify Deploy Preview and check the preview URL on desktop and mobile.
9. Test navigation, timetable generation, print layout, CSV export and daily occurrence entry.
10. Merge only after the preview is approved.
11. Wait for the Netlify production deployment to succeed.
12. Open the live school-centre domain and hard-refresh. Confirm the production build matches the approved preview.

## Important production warning
Do not enter real learner or staff personal information into this demo. Browser-session data is temporary. Before onboarding a school, implement authentication, database persistence, school-level tenant isolation, role-based access, audit logs, backups, privacy notices and data-protection controls.

## Netlify
If the existing project is already linked to GitHub, merging to the configured production branch normally triggers a deploy. Confirm the correct repository, production branch, build command and publish directory in Netlify before merging. For a plain static HTML preview, the publish directory is the folder containing `index.html`; do not overwrite an existing build configuration without checking it.

## Rollback
If the production deployment fails or the live site is incorrect, use Netlify's deploy history to restore the last known-good production deploy, then fix the branch and preview before trying again.


## V6 integrated module (same website)
The V6 application is included under `v6/app/` and is launched from the V5 navigation and dashboard. Deploy the entire project folder to the same Netlify site; the V6 pages are served at `/v6/app/index.html`. V5 files and its original database starter schema are retained. V6 migrations are separate under `v6/database/` and must be applied only to a separate V6 Supabase project. Configure `v6/app/supabase-config.js` with the V6 project URL and public anon/publishable key. Do not reuse V5 production credentials or put a service-role key in browser code.

This is a same-domain integration by navigation/link, not a shared database or unified authentication. Full cross-module single sign-on and shared data are not enabled.
