-- Shared last-known-good Open-Meteo weather payloads for physical frames.
-- Prefetch fills this cache before Power Saver wakes the device. Service-only.
create table if not exists public.weather_forecast_cache (
  cache_key text primary key,
  lat numeric not null,
  lon numeric not null,
  forecast_days integer not null check (forecast_days between 1 and 7),
  payload jsonb not null,
  fetched_at timestamptz not null default now()
);

alter table public.weather_forecast_cache enable row level security;

revoke all on table public.weather_forecast_cache from anon, authenticated;
grant select, insert, update, delete on table public.weather_forecast_cache to service_role;

create index if not exists weather_forecast_cache_fetched_at_idx
  on public.weather_forecast_cache(fetched_at);
