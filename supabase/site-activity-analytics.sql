-- JSLH anonymous and signed-in site activity analytics
-- Apply to the Junior School Learning Hub production Supabase project.
create table if not exists public.site_activity_events (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null,
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in (
    'page_view','resource_view','resource_open','resource_download',
    'access_prompt','payment_prompt','registration_started','login_started',
    'quiz_started','quiz_completed','tuition_enquiry'
  )),
  page_path text not null default '/',
  resource_id text,
  resource_title text,
  resource_category text,
  access_type text check (access_type is null or access_type in ('free','premium','unknown')),
  grade text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists site_activity_events_created_idx on public.site_activity_events(created_at desc);
create index if not exists site_activity_events_visitor_idx on public.site_activity_events(visitor_id, created_at desc);
create index if not exists site_activity_events_user_idx on public.site_activity_events(user_id, created_at desc);
create index if not exists site_activity_events_resource_idx on public.site_activity_events(resource_id, created_at desc);
alter table public.site_activity_events enable row level security;
revoke all on public.site_activity_events from anon, authenticated;
grant all on public.site_activity_events to service_role;
