-- Run manually in the Supabase SQL Editor for the existing project.
-- This creates/ensures a PRIVATE bucket. It does not alter credentials,
-- entitlements, authentication, payment functions, or any other bucket.
insert into storage.buckets (id, name, public)
values ('grade9-mathematics-private', 'grade9-mathematics-private', false)
on conflict (id) do update set public = false;

-- Intentionally create no storage.objects policies for anon or authenticated.
-- Private lesson access is only through the entitlement-checking Netlify
-- function, which uses the server-only SUPABASE_SERVICE_ROLE_KEY.
