-- Phase 1 coordination state for explicit, device-acknowledged display updates.
create table if not exists public.device_update_state (
  device_id text primary key references public.devices(device_id) on delete cascade,
  app_active_until timestamptz,
  requested_revision bigint not null default 0 check (requested_revision >= 0),
  displayed_revision bigint not null default 0 check (displayed_revision >= 0),
  last_displayed_at timestamptz,
  constraint device_update_state_displayed_not_ahead
    check (displayed_revision <= requested_revision)
);

alter table public.device_update_state enable row level security;

-- All access is intentionally service-role-only. The API authenticates either a
-- device membership or the physical device token before reading or mutating state.
-- With RLS enabled and no policies, direct client access is denied as defense in depth.
drop policy if exists "device members can read update state" on public.device_update_state;
revoke all on public.device_update_state from anon, authenticated;

create or replace function public.heartbeat_device_app_activity(p_device_id text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_active_until timestamptz := clock_timestamp() + interval '2 minutes';
  result timestamptz;
begin
  insert into public.device_update_state (device_id, app_active_until)
  values (p_device_id, next_active_until)
  on conflict (device_id) do update
    set app_active_until = greatest(
      coalesce(device_update_state.app_active_until, '-infinity'::timestamptz),
      excluded.app_active_until
    )
  returning app_active_until into result;
  return result;
end;
$$;

create or replace function public.request_device_display_revision(p_device_id text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  result bigint;
begin
  insert into public.device_update_state (device_id, requested_revision)
  values (p_device_id, 1)
  on conflict (device_id) do update
    set requested_revision = device_update_state.requested_revision + 1
  returning requested_revision into result;
  return result;
end;
$$;

create or replace function public.ack_device_display_revision(
  p_device_id text,
  p_displayed_revision bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  result bigint;
begin
  if p_displayed_revision < 0 then
    raise exception 'revision_not_requested' using errcode = '22023';
  end if;

  update public.device_update_state
  set displayed_revision = greatest(displayed_revision, p_displayed_revision),
      last_displayed_at = case
        when p_displayed_revision > displayed_revision then clock_timestamp()
        else last_displayed_at
      end
  where device_id = p_device_id
    and p_displayed_revision <= requested_revision
  returning displayed_revision into result;

  if result is null then
    raise exception 'revision_not_requested' using errcode = '22023';
  end if;
  return result;
end;
$$;

revoke execute on function public.heartbeat_device_app_activity(text) from public, anon, authenticated;
revoke execute on function public.request_device_display_revision(text) from public, anon, authenticated;
revoke execute on function public.ack_device_display_revision(text, bigint) from public, anon, authenticated;
grant execute on function public.heartbeat_device_app_activity(text) to service_role;
grant execute on function public.request_device_display_revision(text) to service_role;
grant execute on function public.ack_device_display_revision(text, bigint) to service_role;
