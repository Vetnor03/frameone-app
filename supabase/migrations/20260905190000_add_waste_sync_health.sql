alter table public.user_integrations
  add column if not exists last_success_at timestamptz,
  add column if not exists last_error_at timestamptz,
  add column if not exists last_error_code text;

alter table public.waste_provider_registry drop constraint if exists waste_provider_registry_provider_valid;
alter table public.waste_provider_registry add constraint waste_provider_registry_provider_valid
  check (provider in ('min_renovasjon', 'stavanger', 'sandnes', 'hentavfall', 'generic_ics', 'manual'));

notify pgrst, 'reload schema';
