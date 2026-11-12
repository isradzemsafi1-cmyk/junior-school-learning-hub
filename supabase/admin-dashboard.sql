-- Junior School Learning Hub: secure administrator activity log
-- Run in Supabase SQL Editor after the Tuition Centre schema.
create table if not exists public.admin_activity_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id) on delete restrict,
  action text not null,
  target_user_id uuid references auth.users(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_activity_logs_created_idx
  on public.admin_activity_logs(created_at desc);
alter table public.admin_activity_logs enable row level security;
revoke all on public.admin_activity_logs from anon, authenticated;
grant all on public.admin_activity_logs to service_role;
