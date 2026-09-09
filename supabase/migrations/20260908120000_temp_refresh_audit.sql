-- TEMP_REFRESH_AUDIT: temporary diagnostic storage for physical refresh decisions.
-- Remove this entire migration's objects after refresh/wake tuning is complete.
create table public.temp_refresh_audit_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default clock_timestamp(),
  occurred_at timestamptz,
  device_id text not null,
  event_seq bigint not null check (event_seq > 0),
  firmware_version text, trigger text not null, source text, module text,
  raw_changes jsonb not null default '{}'::jsonb,
  display_changes jsonb not null default '{}'::jsonb,
  previous_render_hash text, new_render_hash text, render_changed boolean,
  display_attempted boolean not null default false,
  display_succeeded boolean,
  refresh_type_attempted text not null check (refresh_type_attempted in ('none', 'partial', 'full')),
  physical_refresh boolean not null default false,
  refresh_type text not null check (refresh_type in ('none', 'partial', 'full')),
  dirty_regions jsonb not null default '[]'::jsonb,
  decision text not null check (decision in ('filtered_change', 'useful_redraw', 'wasted_redraw', 'no_redraw', 'avoidable_wake', 'intentional_refresh', 'display_failed')),
  decision_reason text, backend_revision_before bigint, backend_revision_after bigint,
  battery_percent real, battery_voltage real, charger_connected boolean,
  wake_reason text, metadata jsonb not null default '{}'::jsonb
);
comment on table public.temp_refresh_audit_logs is
  'TEMP_REFRESH_AUDIT temporary diagnostic data; remove after refresh tuning';
create index temp_refresh_audit_device_created on public.temp_refresh_audit_logs(device_id, created_at desc);
create unique index temp_refresh_audit_device_event on public.temp_refresh_audit_logs(device_id, event_seq);
create index temp_refresh_audit_wasted on public.temp_refresh_audit_logs(created_at desc)
  where physical_refresh = true and render_changed = false;
create index temp_refresh_audit_grouping on public.temp_refresh_audit_logs(trigger, module, source);
alter table public.temp_refresh_audit_logs enable row level security;
revoke all on public.temp_refresh_audit_logs from public, anon, authenticated;

-- TEMP_REFRESH_AUDIT retention: run from existing Supabase cron infrastructure
-- once daily; no frame wake/network activity is involved. It can be invoked by
-- existing maintenance where pg_cron is unavailable.
create or replace function public.temp_refresh_audit_cleanup()
returns void language sql security definer set search_path = '' as $$
  delete from public.temp_refresh_audit_logs where created_at < clock_timestamp() - interval '14 days';
$$;
revoke execute on function public.temp_refresh_audit_cleanup() from public, anon, authenticated;
grant execute on function public.temp_refresh_audit_cleanup() to service_role;
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('TEMP_REFRESH_AUDIT_retention', '17 3 * * *',
      'select public.temp_refresh_audit_cleanup()');
  end if;
exception when others then
  raise notice 'TEMP_REFRESH_AUDIT pg_cron unavailable; invoke cleanup from existing maintenance';
end $$;
