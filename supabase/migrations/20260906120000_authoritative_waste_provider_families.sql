-- Phase 1: this table mirrors the server-side authoritative allow-list. Provider
-- family is a technical adapter contract; provider_brand is display provenance.
alter table public.waste_provider_registry
  drop constraint if exists waste_provider_registry_provider_valid,
  drop constraint if exists waste_provider_registry_status_valid;

alter table public.waste_provider_registry
  add column if not exists provider_brand text,
  add constraint waste_provider_registry_provider_valid
    check (provider in ('him', 'oslo', 'minrenovasjon', 'renovasjonsportal', 'norconsult_unresolved')),
  add constraint waste_provider_registry_status_valid
    check (status in ('supported', 'preview', 'unsupported', 'disabled'));

delete from public.waste_provider_registry;

insert into public.waste_provider_registry
  (municipality_number, municipality_name, provider, provider_brand, provider_config, status)
values
  ('0301', 'Oslo', 'oslo', 'Oslo kommune', '{}'::jsonb, 'supported'),
  ('1103', 'Stavanger', 'norconsult_unresolved', 'Stavanger kommune', '{}'::jsonb, 'preview'),
  ('1106', 'Haugesund', 'him', 'Haugaland Interkommunale Miljøverk', '{}'::jsonb, 'supported'),
  ('1108', 'Sandnes', 'norconsult_unresolved', 'Sandnes kommune', '{}'::jsonb, 'preview'),
  ('3205', 'Lillestrøm', 'minrenovasjon', 'ROAF', '{}'::jsonb, 'supported'),
  ('3220', 'Enebakk', 'minrenovasjon', 'ROAF', '{}'::jsonb, 'supported'),
  ('3222', 'Lørenskog', 'minrenovasjon', 'ROAF', '{}'::jsonb, 'supported'),
  ('3224', 'Rælingen', 'minrenovasjon', 'ROAF', '{}'::jsonb, 'supported'),
  ('3226', 'Aurskog-Høland', 'minrenovasjon', 'ROAF', '{}'::jsonb, 'supported'),
  ('3230', 'Gjerdrum', 'minrenovasjon', 'ROAF', '{}'::jsonb, 'supported'),
  ('3232', 'Nittedal', 'minrenovasjon', 'ROAF', '{}'::jsonb, 'supported'),
  ('5006', 'Steinkjer', 'renovasjonsportal', 'ReMidt', '{"base_url":"https://kalender.renovasjonsportal.no/api"}'::jsonb, 'supported'),
  ('5055', 'Heim', 'renovasjonsportal', 'ReMidt', '{"base_url":"https://kalender.renovasjonsportal.no/api"}'::jsonb, 'supported'),
  ('5059', 'Orkland', 'renovasjonsportal', 'ReMidt', '{"base_url":"https://kalender.renovasjonsportal.no/api"}'::jsonb, 'supported'),
  ('5020', 'Osen', 'renovasjonsportal', 'Fosen Renovasjon', '{"base_url":"https://fosen.renovasjonsportal.no/api"}'::jsonb, 'supported'),
  ('5054', 'Indre Fosen', 'renovasjonsportal', 'Fosen Renovasjon', '{"base_url":"https://fosen.renovasjonsportal.no/api"}'::jsonb, 'supported');

notify pgrst, 'reload schema';
