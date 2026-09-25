-- Persist the final physical Surf payload so manual frame redraws do not
-- recompute forecast scoring. The service role is the only API role allowed
-- to access this internal cache; physical clients reach it only through the
-- authenticated Surf route.
create table if not exists public.surf_frame_result_cache (
  cache_key text primary key,
  payload jsonb not null,
  refreshed_at timestamptz not null default now()
);

alter table public.surf_frame_result_cache enable row level security;

revoke all on table public.surf_frame_result_cache from anon, authenticated;
grant select, insert, update, delete on table public.surf_frame_result_cache to service_role;

create index if not exists surf_frame_result_cache_refreshed_idx
  on public.surf_frame_result_cache(refreshed_at);
