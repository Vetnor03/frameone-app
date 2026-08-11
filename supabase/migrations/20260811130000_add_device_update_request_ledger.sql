-- Preserve idempotency even when a retry arrives after newer update requests.
-- This is additive for existing device state and safe for legacy null request IDs.
create table if not exists public.device_update_requests (
  device_id text not null references public.devices(device_id) on delete cascade,
  request_id text not null,
  requested_revision bigint not null check (requested_revision > 0),
  requested_at timestamptz not null default clock_timestamp(),
  primary key (device_id, request_id)
);

alter table public.device_update_requests enable row level security;
revoke all on public.device_update_requests from public, anon, authenticated;
grant select, insert, update, delete on public.device_update_requests to service_role;

-- Seed the latest operation recorded by the preceding durable-request migration
-- so an in-flight retry remains idempotent across this migration boundary.
insert into public.device_update_requests (
  device_id, request_id, requested_revision, requested_at
)
select device_id, request_id, requested_revision, requested_at
from public.device_update_state
where request_id is not null
  and requested_at is not null
  and requested_revision > 0
on conflict (device_id, request_id) do nothing;

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

  -- The device row is the serialization lock. It makes concurrent delivery of
  -- one request ID return one revision, while the ledger also makes a delayed
  -- retry idempotent after newer requests have been accepted.
  insert into public.device_update_state (device_id)
  values (p_device_id)
  on conflict (device_id) do nothing;

  perform 1
  from public.device_update_state
  where device_id = p_device_id
  for update;

  select requested_revision into result
  from public.device_update_requests
  where device_id = p_device_id and request_id = p_request_id;

  if result is not null then
    return result;
  end if;

  update public.device_update_state
  set requested_revision = requested_revision + 1,
      requested_at = clock_timestamp(),
      request_id = p_request_id
  where device_id = p_device_id
  returning requested_revision into result;

  insert into public.device_update_requests (
    device_id, request_id, requested_revision, requested_at
  )
  select device_id, request_id, requested_revision, requested_at
  from public.device_update_state
  where device_id = p_device_id;

  return result;
end;
$$;

revoke execute on function public.request_device_display_revision(text, text) from public, anon, authenticated;
grant execute on function public.request_device_display_revision(text, text) to service_role;
