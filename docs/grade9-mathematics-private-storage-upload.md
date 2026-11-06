# Grade 9 Mathematics private-storage upload guide

The branch deliberately does not contain premium notes, quiz answers, or the source files. Store reviewed term payloads only in the private Supabase Storage bucket, never in the website directory, Git, a public URL, or browser code.

## 1. Prepare private content locally

1. In a trusted local workspace, create the ignored directory `private-content/grade9-mathematics/`.
2. Create `term-i.json`, `term-ii.json`, and `term-iii.json` there. Each JSON object must have the corresponding `term` value (`I`, `II`, or `III`) and a `topics` array in the order documented in `grade9-mathematics-library-plan.md`.
3. For each topic use the page schema documented in that plan. Include lesson notes, worked examples, exercises, explanations and quiz answer keys only when supported by the supplied notes PDF. Do not invent missing topics or use the school name. Keep the documented source gaps explicitly marked for editorial follow-up, and do not provide answer keys for absent source material.
4. Review calculations, OCR, punctuation, and answer choices against the original PDF before uploading. The uploaded source files remain local and must not be copied to Git.
5. Run `node --test tests/grade9-mathematics.test.mjs` for server access and quiz helper checks. The term payload itself is not committed; manually validate its shape and ordering against the schemes before upload.

## 2. Create/verify the private bucket (manual Supabase action)

1. Open the existing Supabase project Dashboard → SQL Editor using an authorized administrator account.
2. Review and run `supabase/grade9-mathematics-private-bucket.sql`. It creates or forces the `grade9-mathematics-private` bucket to `public = false`; it adds no anonymous or authenticated `storage.objects` policies and changes no credentials or other objects.
3. In Storage, confirm the bucket is listed as **Private**. Inspect Storage policies and verify there is no policy granting `anon` or `authenticated` access to these bucket objects. Do not expose or paste the service-role key.
4. From an unauthenticated browser/session, attempt a GET to the Supabase Storage object URL after uploading a test object. It must return an authorization failure, not the object. Remove the test object afterward. This direct-access verification must be performed by an administrator; repository changes cannot establish the live bucket state.

## 3. Upload reviewed term files

Using Supabase Dashboard → Storage → `grade9-mathematics-private`, upload the corresponding local files with these exact object paths (create the folders as needed):

- `grade9/mathematics/term-i.json`
- `grade9/mathematics/term-ii.json`
- `grade9/mathematics/term-iii.json`

Keep the bucket private. Do not create public/signed URLs. The Netlify function fetches the objects server-side only after checking the learner JWT and a live, unexpired `grade9_notes` entitlement.

## 4. Verify access end to end

On a non-production deploy preview, verify: no token → HTTP 401; invalid/expired token → HTTP 401; valid learner without active entitlement → HTTP 403; valid entitled learner → term data; no direct anonymous Storage read; expired entitlement → HTTP 403. Then check each term/topic, quiz feedback and score history using an authorized test learner. Do not use a production payment or alter M-Pesa callbacks during testing.

Manual actions required: run the SQL in Supabase, verify bucket privacy and policies, create/review the local term JSON, upload it, and perform authenticated and anonymous storage/access tests. These actions are not performed by this branch change.
