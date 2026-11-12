# V6 preview and deployment

## Open locally
1. Extract `Digital-School-Centre-V6.zip`.
2. Open `app/index.html` in Chrome.
3. School setup values save only in that browser's local storage.
4. The KJSEA calculator works locally and uses the KNEC 2025 published boundaries.

## Netlify preview
For a static preview, deploy the contents of the `app` folder (publish directory: `app`) to a separate Netlify site or branch deploy. Do not replace the current production site or V5 deploy settings without confirming the linked repository and publish directory.

## Database
`database/001_v6_foundation.sql` is a development foundation migration for Supabase/PostgreSQL. Apply only to a NEW development project after review. It intentionally does not provide broad client write policies. Trusted onboarding and role/assignment-specific writes must be implemented server-side before use.

## Not production ready
This preview does not authenticate users, persist data to Supabase, send messages, collect fees, run a production timetable solver or store learner records remotely. Do not upload real child or staff information.


## V6.1 local academic core preview
The Academic Core menu now supports local-browser creation/deletion of academic years and terms, grades and streams, staff, learners and learning areas, plus CSV export. The localStorage data is device/browser-specific and is not a live database. The preview must use fictional data only.
Apply `database/002_v61_tenant_integrity.sql` only after `001_v6_foundation.sql` in a development database. It adds composite foreign-key constraints to prevent cross-tenant references. It does not create client write policies or a self-service privileged school-owner registration endpoint.
