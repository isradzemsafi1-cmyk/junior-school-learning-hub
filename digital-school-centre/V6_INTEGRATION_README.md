# V6 integration into the existing Digital School Centre website

V5 remains at the root and its original `index.html` is preserved except for a V6 launch link in navigation and dashboard. V6 is mounted under `/v6/app/`. This allows one Netlify deployment and one domain while retaining separate application files and a separate V6 Supabase database.

## Open V6
Visit `/v6/app/index.html`, or use the new V6 link in the V5 sidebar.

## Database boundary
Apply `v6/database/001` through `005` only to a new V6 development Supabase project. V5 database tables are not migrated or shared. Configure `v6/app/supabase-config.js` with the V6 Project URL and public anon/publishable key. Never expose a service-role key.

## Current limitations
The V6 academic setup and operations UI require the V6 migrations and public client configuration. V6.3 timetable generation and examination analysis preview remains partly local/demo; V6.4 supplies live assessment schema and lifecycle controls plus server-side timetable publication checks, but full end-to-end scheduler and report PDF integration remain future work.
