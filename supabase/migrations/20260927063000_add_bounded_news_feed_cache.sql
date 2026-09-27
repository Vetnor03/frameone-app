-- Shared, bounded NRK snapshot for both app and physical frames. The
-- checked_at timestamp also throttles transient origin failures across frames.
create table if not exists public.news_feed_cache (
  feed_url text primary key,
  items jsonb not null default '[]'::jsonb,
  refreshed_at timestamptz,
  checked_at timestamptz not null default now()
);

alter table public.news_feed_cache enable row level security;
revoke all on table public.news_feed_cache from anon, authenticated;
grant select, insert, update, delete on table public.news_feed_cache to service_role;

create index if not exists news_feed_cache_checked_idx
  on public.news_feed_cache(checked_at);
