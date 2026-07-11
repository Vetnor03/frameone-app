-- Remove Friskus data/configuration while keeping reusable Local events tables.
-- This migration is provider-specific and intentionally does not drop any Local events tables.
begin;

-- Remove imported Friskus local-event reminder/calendar rows only.
delete from public.integration_items
where provider = 'local_events'
  and (
    external_id ilike 'friskus:%'
    or external_id ilike 'friskus-rss:%'
    or raw->>'friskus_rss_source' is not null
    or raw->>'provider' in ('friskus', 'friskus-rss', 'stavanger-friskus')
    or raw->>'source' in ('friskus', 'friskus-rss', 'stavanger-friskus')
    or raw->>'source_url' ilike '%friskus.com%'
  );

-- Mark old Friskus Local events integrations disconnected without deleting other integrations.
update public.user_integrations
set status = 'disconnected',
    encrypted_credentials = jsonb_build_object('status', 'coming_soon'),
    external_account_id = null,
    external_account_label = null,
    last_error = 'Local events are coming soon.',
    last_sync_at = null,
    updated_at = now()
where provider = 'local_events'
  and (
    encrypted_credentials ? 'municipality_number'
    or encrypted_credentials ? 'filters'
    or external_account_label in ('Stavanger', 'Sandnes')
    or external_account_id in ('1103', '1108')
  );

-- Remove Friskus registry rows before tightening the provider constraint.
delete from public.local_events_provider_registry
where provider in ('friskus', 'friskus-rss', 'stavanger-friskus')
   or provider_config::text ilike '%friskus%';

alter table public.local_events_provider_registry
  drop constraint if exists local_events_provider_registry_provider_valid;

alter table public.local_events_provider_registry
  add constraint local_events_provider_registry_provider_valid
  check (provider in ('edge-of-norway', 'manual'));

-- Keep current municipalities visible as unsupported placeholders for the future provider.
insert into public.local_events_provider_registry
  (municipality_number, municipality_name, provider, provider_config, status)
values
  ('1103', 'Stavanger', 'edge-of-norway', '{"live_endpoint":null}'::jsonb, 'unsupported'),
  ('1108', 'Sandnes', 'edge-of-norway', '{"live_endpoint":null}'::jsonb, 'unsupported')
on conflict (municipality_number) do update
set municipality_name = excluded.municipality_name,
    provider = excluded.provider,
    provider_config = excluded.provider_config,
    status = excluded.status,
    updated_at = now();

commit;
