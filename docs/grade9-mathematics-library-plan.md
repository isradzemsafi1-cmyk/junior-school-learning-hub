# Grade 9 Mathematics library — source-first implementation plan

## Current status

This branch contains a responsive, blue-and-gold Mathematics library shell with Term I, Term II and Term III navigation. Topic order and premium lesson content are intentionally blank until the three term schemes of work and Mathematics notes PDF are supplied. Do not infer topic names, order, examples or answers from other grades or generic curricula. Do not copy any school name that may appear in the source documents.

The existing homepage, Grade 7/8 resources, Grade 9 access page, payment functions, Supabase setup, registration and dashboard are outside the scope of this preparation work and must remain unchanged.

## Premium content storage

Store finished source-derived lesson JSON in a **private Supabase Storage bucket**, not in the repository, static site assets, browser code, or a public bucket. The planned bucket name is `grade9-mathematics-private`; create it as private using the existing Supabase project controls, without changing project credentials or configuration. The server-side Netlify function `get-grade9-mathematics-content` is the only planned delivery path. It verifies the learner session and active `grade9_notes` entitlement before reading objects with the existing server-only `SUPABASE_SERVICE_ROLE_KEY`.

Object paths:

- `grade9/mathematics/term-i.json`
- `grade9/mathematics/term-ii.json`
- `grade9/mathematics/term-iii.json`

The function is scaffolded now; because the private bucket and source-derived objects have not been created, it will return an unavailable response until those objects exist. Never commit the source PDF, scheme documents, extracted premium notes, quiz answers, or a service-role key to Git.

## Lesson object shape (create only after reviewing the source documents)

Each term object will include `term` and `topics`. Topic items will include a stable `id`, source-ordered `title`, outcomes split into `knowledge`, `skills`, and `attitudes`, `notes`, `definitions`, `rulesAndFormulas`, `workedExamples` with ordered steps, `applications`, `exercises`, `answersAndExplanations`, and `quiz` items with choices, correct answer and feedback. Keep all lesson text and quiz keys in the private bucket. Client code receives these fields only through the entitlement-checked function.

## Before publishing

1. Receive and review all four actual source files; transcribe topic headings and order from the corresponding term schemes.
2. Develop notes and examples from the supplied notes PDF, omitting school-identifying names and details.
3. Check every calculation and answer independently; validate each quiz's answer index and feedback.
4. Upload term JSON to the private bucket and verify unauthenticated, expired-session and no-entitlement requests cannot retrieve it; verify active entitlement can.
5. Integrate term/topic navigation with the existing Grade 9 access page and quiz-progress flow without changing M-Pesa behavior or other grades.
6. Test desktop and narrow mobile layouts, term/topic links, every quiz and feedback, progress saving, sign-in/sign-out, payment handoff, and existing homepage/Grade 7/8 journeys on a deploy preview before any merge. Do not merge to `main` before these tests pass.
