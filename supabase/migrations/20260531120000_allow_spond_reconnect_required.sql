alter table public.user_integrations
  drop constraint if exists user_integrations_status_valid;

alter table public.user_integrations
  add constraint user_integrations_status_valid
  check (status in ('connected', 'disconnected', 'error', 'reconnect_required'));
