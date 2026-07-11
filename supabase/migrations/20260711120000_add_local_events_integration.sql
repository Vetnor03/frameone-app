-- Local events integration uses the existing user_integrations/integration_items tables.
-- This migration records the first supported municipality/provider pair and allows
-- cached/stale provider metadata to be extended without changing reminder storage.
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
  constraint local_events_provider_registry_provider_valid check (provider in ('stavanger-friskus', 'manual')),
  constraint local_events_provider_registry_status_valid check (status in ('supported', 'unsupported', 'disabled'))
);

create index if not exists local_events_provider_registry_status_idx
  on public.local_events_provider_registry (status);

alter table public.local_events_provider_registry enable row level security;

drop policy if exists "Anyone can read local events provider registry" on public.local_events_provider_registry;
create policy "Anyone can read local events provider registry"
on public.local_events_provider_registry
for select
using (true);

insert into public.local_events_provider_registry (municipality_number, municipality_name, provider, provider_config, status)
values (
  '1103',
  'Stavanger',
  'stavanger-friskus',
  '{"base_url":"https://stavanger.friskus.com","municipality_uuid":"f76ec1ae-dc3b-4291-bfb9-a4fec0c129fd","initial_horizon_days":14}'::jsonb,
  'supported'
)
on conflict (municipality_number) do update
set municipality_name = excluded.municipality_name,
    provider = excluded.provider,
    provider_config = excluded.provider_config,
    status = excluded.status,
    updated_at = now();

notify pgrst, 'reload schema';
