-- A manual update is itself an app-activity signal. Extend activity both when
-- accepting a new ledger request and when idempotently replaying an old one.
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

  insert into public.device_update_state (device_id)
  values (p_device_id)
  on conflict (device_id) do nothing;

  perform 1 from public.device_update_state
  where device_id = p_device_id for update;

  update public.device_update_state
  set app_active_until = greatest(
    coalesce(app_active_until, '-infinity'::timestamptz),
    clock_timestamp() + interval '2 minutes'
  )
  where device_id = p_device_id;

  select requested_revision into result
  from public.device_update_requests
  where device_id = p_device_id and request_id = p_request_id;
  if result is not null then return result; end if;

  update public.device_update_state
  set requested_revision = requested_revision + 1,
      requested_at = clock_timestamp(),
      request_id = p_request_id
  where device_id = p_device_id
  returning requested_revision into result;

  insert into public.device_update_requests
    (device_id, request_id, requested_revision, requested_at)
  select device_id, request_id, requested_revision, requested_at
  from public.device_update_state where device_id = p_device_id;
  return result;
end;
$$;

revoke execute on function public.request_device_display_revision(text, text) from public, anon, authenticated;
grant execute on function public.request_device_display_revision(text, text) to service_role;
