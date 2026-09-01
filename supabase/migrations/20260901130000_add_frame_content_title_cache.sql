-- Durable service-role-only display title cache. The SHA-256 identity contains
-- no source text, dates, revisions, request identifiers, or timestamps.
create table if not exists public.frame_content_title_cache (
  cache_key text primary key,
  optimized_title text not null,
  optimizer_version text not null,
  model text not null,
  display_profile text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.frame_content_title_cache enable row level security;

-- Deliberately no authenticated/anon policies: PostgREST access is restricted
-- to the service role used by physical device endpoints.
revoke all on table public.frame_content_title_cache from anon, authenticated;
grant all on table public.frame_content_title_cache to service_role;
