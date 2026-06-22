create table if not exists public.waste_provider_registry (
  municipality_number text primary key,
  municipality_name text not null,
  provider text not null,
  provider_config jsonb not null default '{}'::jsonb,
  status text not null default 'unsupported',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint waste_provider_registry_number_not_empty check (char_length(btrim(municipality_number)) > 0),
  constraint waste_provider_registry_name_not_empty check (char_length(btrim(municipality_name)) > 0),
  constraint waste_provider_registry_provider_valid check (provider in ('min_renovasjon', 'stavanger', 'sandnes', 'generic_ics', 'manual')),
  constraint waste_provider_registry_status_valid check (status in ('supported', 'unsupported', 'disabled'))
);

create index if not exists waste_provider_registry_status_idx
  on public.waste_provider_registry (status);

alter table public.waste_provider_registry enable row level security;

drop policy if exists "Anyone can read waste provider registry" on public.waste_provider_registry;
create policy "Anyone can read waste provider registry"
on public.waste_provider_registry
for select
using (true);

insert into public.waste_provider_registry (municipality_number, municipality_name, provider, provider_config, status)
values
  ('1103', 'Stavanger kommune', 'stavanger', '{}'::jsonb, 'supported'),
  ('1108', 'Sandnes kommune', 'sandnes', '{}'::jsonb, 'supported')
on conflict (municipality_number) do update
set
  municipality_name = excluded.municipality_name,
  provider = excluded.provider,
  provider_config = excluded.provider_config,
  status = excluded.status,
  updated_at = now();

-- Make the table visible to PostgREST immediately after applying this migration.
notify pgrst, 'reload schema';
