-- Enable the Edge of Norway server-side public-page provider and store the
-- selected city as a visual preference only. It must not filter imported events.
insert into public.local_events_provider_registry
  (municipality_number, municipality_name, provider, provider_config, status)
values
  ('1103', 'Stavanger', 'edge-of-norway', '{"place_slug":"stavanger","source":"public_page"}'::jsonb, 'supported'),
  ('1108', 'Sandnes', 'edge-of-norway', '{"place_slug":"sandnes","source":"public_page"}'::jsonb, 'supported'),
  ('1124', 'Sola', 'edge-of-norway', '{"place_slug":"sola","source":"public_page"}'::jsonb, 'supported'),
  ('1101', 'Egersund', 'edge-of-norway', '{"place_slug":"egersund","source":"public_page"}'::jsonb, 'supported')
on conflict (municipality_number) do update set
  municipality_name = excluded.municipality_name,
  provider = excluded.provider,
  provider_config = excluded.provider_config,
  status = excluded.status,
  updated_at = now();

-- Remove only previously imported Friskus Local Events records; keep generic tables.
delete from public.integration_items
where provider = 'local_events'
  and (
    external_id ilike 'friskus:%'
    or external_id ilike 'friskus-rss:%'
    or raw->>'provider' in ('friskus', 'friskus-rss', 'stavanger-friskus')
    or raw->>'source' in ('friskus', 'friskus-rss', 'stavanger-friskus')
    or raw->>'source_url' ilike '%friskus.com%'
  );
