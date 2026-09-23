alter table public.device_status
  add column if not exists power_mode text,
  add column if not exists wake_reason text;
