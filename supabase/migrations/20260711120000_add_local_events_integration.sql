-- Local events provider registry. The tables are reusable for future supported
-- local discovery providers; no live provider endpoint is configured here.
create table if not exists public.local_events_provider_registry (
  municipality_number text primary key,
  municipality_name text not null,
  provider text not null,
  provider_config jsonb not null default '{}'::jsonb,
  status text not null default 'unsupported',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint local_events_provider_registry_number_not_empty check (char_length(btrim(municipality_number)) > 0),
  constraint local_events_provider_registry_name_not_empty check (char_length(btrim(municipality_name)) > 0),
  constraint local_events_provider_registry_provider_valid check (provider in ('edge-of-norway', 'manual')),
  constraint local_events_provider_registry_status_valid check (status in ('supported', 'unsupported', 'disabled'))
);

create index if not exists local_events_provider_registry_status_idx
  on public.local_events_provider_registry (status);

alter table public.local_events_provider_registry enable row level security;

drop policy if exists "Anyone can read local events provider registry" on public.local_events_provider_registry;
create policy "Anyone can read local events provider registry"
on public.local_events_provider_registry
for select
to authenticated
using (true);
