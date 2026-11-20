
-- RE:MIND server-only shared IRN timetable cache (public schema, no client access).
-- This is a distributed lease: concurrent serverless invocations cannot duplicate
-- requests to IRN for the same location/day or shared Hijri calendar.
create table if not exists public.irn_shared_cache (
  cache_key text primary key check (char_length(cache_key) between 1 and 180),
  payload jsonb,
  refreshed_at timestamptz,
  lease_token uuid,
  lease_expires_at timestamptz,
  retry_after timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.irn_shared_cache enable row level security;
revoke all on table public.irn_shared_cache from public, anon, authenticated;
grant select, insert, update on table public.irn_shared_cache to service_role;

create or replace function public.irn_shared_cache_claim(p_key text, p_ttl_seconds integer)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  entry public.irn_shared_cache%rowtype;
  claimed uuid;
  current_time timestamptz := clock_timestamp();
begin
  if p_key is null or char_length(p_key) not between 1 and 180
     or p_ttl_seconds is null or p_ttl_seconds not between 60 and 172800 then
    raise exception 'invalid IRN cache request';
  end if;
  insert into public.irn_shared_cache (cache_key) values (p_key)
    on conflict (cache_key) do nothing;
  select * into entry from public.irn_shared_cache where cache_key = p_key for update;
  if entry.payload is not null
     and entry.refreshed_at is not null
     and entry.refreshed_at > current_time - make_interval(secs => p_ttl_seconds) then
    return jsonb_build_object('state', 'hit', 'payload', entry.payload);
  end if;
  if entry.retry_after is not null and entry.retry_after > current_time then
    return jsonb_build_object('state', 'cooldown');
  end if;
  if entry.lease_expires_at is not null and entry.lease_expires_at > current_time then
    return jsonb_build_object('state', 'pending');
  end if;
  claimed := gen_random_uuid();
  update public.irn_shared_cache
    set lease_token = claimed,
        lease_expires_at = current_time + interval '25 seconds',
        retry_after = null,
        updated_at = current_time
    where cache_key = p_key;
  return jsonb_build_object('state', 'claimed', 'token', claimed);
end;
$$;

create or replace function public.irn_shared_cache_publish(p_key text, p_token uuid, p_payload jsonb)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'array' then
    raise exception 'invalid IRN cache data';
  end if;
  update public.irn_shared_cache
    set payload = p_payload, refreshed_at = clock_timestamp(),
        lease_token = null, lease_expires_at = null, retry_after = null,
        updated_at = clock_timestamp()
    where cache_key = p_key and lease_token = p_token and lease_expires_at > clock_timestamp();
  return found;
end;
$$;

create or replace function public.irn_shared_cache_fail(p_key text, p_token uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.irn_shared_cache
    set lease_token = null, lease_expires_at = null,
        retry_after = clock_timestamp() + interval '60 seconds',
        updated_at = clock_timestamp()
    where cache_key = p_key and lease_token = p_token;
  return found;
end;
$$;

-- These RPCs do not need elevated definer privileges. The Vercel backend
-- invokes them with the service-role key; browser roles are denied.
revoke all on function public.irn_shared_cache_claim(text, integer) from public, anon, authenticated;
revoke all on function public.irn_shared_cache_publish(text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.irn_shared_cache_fail(text, uuid) from public, anon, authenticated;
grant execute on function public.irn_shared_cache_claim(text, integer) to service_role;
grant execute on function public.irn_shared_cache_publish(text, uuid, jsonb) to service_role;
grant execute on function public.irn_shared_cache_fail(text, uuid) to service_role;
