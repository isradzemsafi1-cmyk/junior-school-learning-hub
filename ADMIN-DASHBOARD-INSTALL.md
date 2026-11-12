# Super Administrator Dashboard — installation

## Included
- `admin/index.html` — administrator interface (`/admin/`)
- `netlify/functions/admin-api.mjs` — server-side, allowlisted administrator API
- `supabase/admin-dashboard.sql` — private administrator audit log
- `supabase/tuition-centre-schema.sql` — Tuition Centre tables required by the dashboard (run only if not already installed)

## Before deployment
1. Back up the live repository and database.
2. In the existing Supabase project, open SQL Editor.
3. If the Tuition Centre tables do not already exist, review and run `supabase/tuition-centre-schema.sql` first. If they already exist, do not rerun the setup simply for this dashboard.
4. Run `supabase/admin-dashboard.sql`.
5. In Supabase Authentication > Users, identify the verified administrator account and copy its UUID. Do not use an email address here.
6. In Netlify site environment variables, set:
   - `SUPABASE_URL` = existing Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY` = existing service-role key (server-side only; never put it in HTML or GitHub client code)
   - `JSLH_ADMIN_USER_IDS` = the administrator UUID (multiple verified administrator UUIDs may be comma-separated)
   - `SUPABASE_PUBLISHABLE_KEY` = existing publishable key (optional; function has the current site's public key as fallback)
7. Redeploy the Netlify site.

## Access
Open `https://juniorschoollearninghub.co.ke/admin/`.

Sign in with the Supabase account whose UUID is listed in `JSLH_ADMIN_USER_IDS`. A normal learner or teacher account cannot access the API even if they guess the URL.

## Features
- View registered Tuition Centre learner, teacher and administrator profiles.
- Search learner accounts.
- Change a learner or teacher password directly through the server-side Supabase Auth Admin API.
- Suspend/reactivate an account.
- Create a teacher account and assign a grade and subject.
- Add another grade/subject assignment to an existing teacher.
- View administrator action logs and last sign-in timestamps.

## Important scope and safety notes
- The administrator API uses a server-side allowlist and the Supabase service-role key. The service-role key must remain in Netlify environment variables.
- The dashboard does not change M-Pesa functions, payment entitlements, learning-library content, learner quiz attempts or existing learner passwords.
- The activity log records administrator actions performed through this dashboard. It does not yet record every click or learner activity on the public learning libraries.
- Password changes are immediate. Verify the learner's identity before changing a password and communicate the new password through a private channel.
- Test on a deploy preview first. Do not merge/deploy while another protected-storage or tuition upgrade PR is awaiting review.
