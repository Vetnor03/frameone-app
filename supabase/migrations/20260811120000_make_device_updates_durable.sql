-- Make a manual display update an authoritative, idempotent backend operation.
-- Browser/component lifetime is deliberately absent from this state machine.
alter table public.device_update_state
  add column if not exists requested_at timestamptz,
  add column if not exists request_id text;

drop function if exists public.request_device_display_revision(text);

create or replace function public.request_device_display_revision(
  p_device_id text,
  p_request_id text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  result bigint;
begin
  if p_request_id is null or length(p_request_id) < 8 or length(p_request_id) > 128 then
    raise exception 'invalid_request_id' using errcode = '22023';
  end if;

  insert into public.device_update_state (
    device_id, requested_revision, requested_at, request_id
  )
  values (p_device_id, 1, clock_timestamp(), p_request_id)
  on conflict (device_id) do update
    set requested_revision = case
          when device_update_state.request_id = excluded.request_id
            then device_update_state.requested_revision
          else device_update_state.requested_revision + 1
        end,
        requested_at = case
          when device_update_state.request_id = excluded.request_id
            then device_update_state.requested_at
          else excluded.requested_at
        end,
        request_id = excluded.request_id
  returning requested_revision into result;

  return result;
end;
$$;

revoke execute on function public.request_device_display_revision(text, text) from public, anon, authenticated;
grant execute on function public.request_device_display_revision(text, text) to service_role;
