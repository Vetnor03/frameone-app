-- Keep Stavanger and Sandnes visible in the reusable Local events registry, but
-- mark them unsupported until an official provider feed/API is available.
alter table public.local_events_provider_registry
  drop constraint if exists local_events_provider_registry_provider_valid;

alter table public.local_events_provider_registry
  add constraint local_events_provider_registry_provider_valid check (provider in ('edge-of-norway', 'manual'));

insert into public.local_events_provider_registry (municipality_number, municipality_name, provider, provider_config, status)
values
  ('1103', 'Stavanger', 'edge-of-norway', '{"live_endpoint":null}'::jsonb, 'unsupported'),
  ('1108', 'Sandnes', 'edge-of-norway', '{"live_endpoint":null}'::jsonb, 'unsupported')
on conflict (municipality_number) do update
set municipality_name = excluded.municipality_name,
    provider = excluded.provider,
    provider_config = excluded.provider_config,
    status = excluded.status,
    updated_at = now();
