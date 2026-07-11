-- Extend Local events from Stavanger-only to the shared Friskus provider.
alter table public.local_events_provider_registry
  drop constraint if exists local_events_provider_registry_provider_valid;

alter table public.local_events_provider_registry
  add constraint local_events_provider_registry_provider_valid check (provider in ('friskus', 'manual'));

insert into public.local_events_provider_registry (municipality_number, municipality_name, provider, provider_config, status)
values
  (
    '1103',
    'Stavanger',
    'friskus',
    '{"base_url":"https://stavanger.friskus.com","friskus_identifier":"f76ec1ae-dc3b-4291-bfb9-a4fec0c129fd","initial_horizon_days":14}'::jsonb,
    'supported'
  ),
  (
    '1108',
    'Sandnes',
    'friskus',
    '{"base_url":"https://sandnes.friskus.com","initial_horizon_days":14}'::jsonb,
    'supported'
  )
on conflict (municipality_number) do update
set municipality_name = excluded.municipality_name,
    provider = excluded.provider,
    provider_config = excluded.provider_config,
    status = excluded.status;
