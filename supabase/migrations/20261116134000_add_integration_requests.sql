-- Requests from the Connect tab. Review and prioritize privately in Supabase.
create table if not exists public.integration_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  app_name text not null check (char_length(btrim(app_name)) between 2 and 80),
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'new'
    check (status in ('new', 'reviewing', 'planned', 'added', 'declined')),
  created_at timestamptz not null default now()
);

create unique index if not exists integration_requests_user_app_unique
  on public.integration_requests (user_id, lower(app_name));
create index if not exists integration_requests_review_queue_idx
  on public.integration_requests (status, created_at desc);

alter table public.integration_requests enable row level security;
-- Clients never access this table directly: the authenticated API validates the
-- caller and stores requests using the service role. No public RLS policies.
revoke all on public.integration_requests from public, anon, authenticated;
grant select, insert, update, delete on public.integration_requests to service_role;
