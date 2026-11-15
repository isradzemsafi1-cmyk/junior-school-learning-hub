# Teacher Centre paid PDF rollout

## Agreed prices (KES)
- Scheme of Work: 20 per term
- Topical Questions: 10
- First Lesson Plan: 100
- Full-year Lesson Plans: 200
- Notes: 50
- CAT: 20
- End-Term Examination: 30

## Access model
A teacher pays once per resource. A successful, verified M-Pesa payment grants permanent account-linked access. The secure download endpoint issues a five-minute signed URL only after checking the authenticated user's paid purchase.

## Required deployment steps
1. Apply `supabase/migrations/202611160001_teacher_resource_commerce.sql` in the correct Supabase project.
2. Set Netlify environment variables `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_ANON_KEY` (or `SUPABASE_PUBLISHABLE_KEY`).
3. Upload every Grade 7–9 Teacher Centre PDF to the private `teacher-resources-private` bucket, preserving paths and populate `teacher_resource_catalog` with stable IDs and the agreed prices.
4. Implement and test the M-Pesa checkout/callback fulfilment against `teacher_resource_purchases`. Never mark purchases paid from the browser or an unverified callback.
5. Replace all public PDF anchors on Grade 7, 8 and 9 Teacher Centre pages with authenticated purchase/open actions calling `/.netlify/functions/teacher-resource-access`.
6. Only after successful tests, remove the old public PDF copies. Keep backups until migration validation is complete.

## Important
This PR establishes the private bucket, RLS-protected purchase records, and signed-download gate. It does not by itself migrate existing public PDFs or complete the M-Pesa teacher checkout UI/callback. Do not advertise paid protection or merge into production until steps 1–5 are completed and verified.
