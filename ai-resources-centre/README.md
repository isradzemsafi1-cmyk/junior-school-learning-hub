# Junior School AI Resources Centre

A separate development application for Junior School Learning Hub. It is intentionally isolated from the existing production site and database.

## Local development

1. Copy `.env.example` to `.env.local` and fill in the new development Supabase project's URL and publishable/anon key.
2. Run `npm install`, then `npm run dev`.
3. Apply the SQL migration in `supabase/migrations` to the dedicated development project.
4. Set `GEMINI_API_KEY` as a Netlify Function environment variable for AI generation. Never expose it to the browser.

## Deploy

Create a separate Netlify site connected to this repository, with base directory `ai-resources-centre`. Build command: `npm run build`; publish directory: `dist`. Configure the two `VITE_SUPABASE_*` values for the frontend and `GEMINI_API_KEY` only for Functions.

Generated curriculum content is an editable draft and must be checked against the current official curriculum design before classroom use. Sample content is labelled as illustrative.
