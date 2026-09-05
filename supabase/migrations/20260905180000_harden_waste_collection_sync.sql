-- Waste remains in the existing external-integration cache; these fields distinguish
-- a failed refresh from the last successful refresh without deleting cached pickups.
alter table public.user_integrations
  add column if not exists last_success_at timestamptz,
  add column if not exists last_error_at timestamptz,
  add column if not exists last_error_code text;

alter table public.waste_provider_registry drop constraint if exists waste_provider_registry_provider_valid;
alter table public.waste_provider_registry add constraint waste_provider_registry_provider_valid
  check (provider in ('min_renovasjon', 'stavanger', 'sandnes', 'hentavfall', 'generic_ics', 'manual'));

create index if not exists integration_items_waste_collection_date_idx
  on public.integration_items (((raw ->> 'collection_date')))
  where provider = 'waste';

notify pgrst, 'reload schema';
