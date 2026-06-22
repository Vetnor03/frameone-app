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

notify pgrst, 'reload schema';
