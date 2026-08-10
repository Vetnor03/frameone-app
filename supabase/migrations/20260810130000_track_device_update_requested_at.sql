-- Timestamp each explicit request so clients can reconstruct a manual update
-- after a view remount or an app background/foreground cycle.
alter table public.device_update_state
  add column if not exists requested_at timestamptz;

create or replace function public.request_device_display_revision(p_device_id text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  result bigint;
begin
  insert into public.device_update_state (device_id, requested_revision, requested_at)
  values (p_device_id, 1, clock_timestamp())
  on conflict (device_id) do update
    set requested_revision = device_update_state.requested_revision + 1,
        requested_at = clock_timestamp()
  returning requested_revision into result;
  return result;
end;
$$;

revoke execute on function public.request_device_display_revision(text) from public, anon, authenticated;
grant execute on function public.request_device_display_revision(text) to service_role;
