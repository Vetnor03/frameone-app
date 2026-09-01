-- Optional power-policy telemetry. This repair is intentionally forward-only
-- and does not touch either requested_revision or displayed_revision.
alter table public.device_update_state
  add column if not exists last_probe_at timestamptz,
  add column if not exists app_active_until timestamptz;
