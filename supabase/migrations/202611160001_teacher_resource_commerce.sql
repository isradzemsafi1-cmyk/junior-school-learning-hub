-- Teacher Centre paid-resource foundation
-- Apply in the Supabase SQL editor before enabling paid downloads.
-- Existing public PDF files must be migrated to the private bucket before links are removed.

create table if not exists public.teacher_resource_catalog (
  id text primary key,
  grade smallint not null check (grade between 7 and 9),
  subject text not null,
  resource_type text not null check (resource_type in
    ('scheme_term','topical_questions','lesson_plan_first','lesson_plans_full_year','notes','cat','end_term_exam')),
  title text not null,
  price_kes integer not null check (price_kes > 0),
  storage_path text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.teacher_resource_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  resource_id text not null references public.teacher_resource_catalog(id),
  amount_kes integer not null check (amount_kes > 0),
  payment_id uuid references public.payments(id),
  status text not null default 'pending' check (status in ('pending','paid','failed')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique(user_id, resource_id)
);

alter table public.teacher_resource_catalog enable row level security;
alter table public.teacher_resource_purchases enable row level security;

drop policy if exists "Anyone can view active teacher resource listings" on public.teacher_resource_catalog;
create policy "Anyone can view active teacher resource listings"
on public.teacher_resource_catalog for select
using (active = true);

drop policy if exists "Teachers can view their own resource purchases" on public.teacher_resource_purchases;
create policy "Teachers can view their own resource purchases"
on public.teacher_resource_purchases for select to authenticated
using (auth.uid() = user_id);

-- No client-side INSERT/UPDATE/DELETE policies: only trusted server functions
-- using the Supabase service role may create or fulfil purchases.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('teacher-resources-private','teacher-resources-private',false,25000000,array['application/pdf'])
on conflict (id) do update set public = false;
