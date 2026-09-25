-- Record the physical device's live-update checks so the app can estimate the
-- next two-minute wake without inventing a countdown from the button press.
alter table public.device_update_state
  add column if not exists last_probe_at timestamptz;
