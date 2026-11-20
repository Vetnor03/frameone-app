create or replace function public.irn_shared_cache_claim(p_key text, p_ttl_seconds integer)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  entry public.irn_shared_cache%rowtype;
  claimed uuid;
  v_now timestamptz := clock_timestamp();
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
     and entry.refreshed_at > v_now - make_interval(secs => p_ttl_seconds) then
    return jsonb_build_object('state', 'hit', 'payload', entry.payload);
  end if;
  if entry.retry_after is not null and entry.retry_after > v_now then
    return jsonb_build_object('state', 'cooldown');
  end if;
  if entry.lease_expires_at is not null and entry.lease_expires_at > v_now then
    return jsonb_build_object('state', 'pending');
  end if;
  claimed := gen_random_uuid();
  update public.irn_shared_cache
    set lease_token = claimed,
        lease_expires_at = v_now + interval '25 seconds',
        retry_after = null,
        updated_at = v_now
    where cache_key = p_key;
  return jsonb_build_object('state', 'claimed', 'token', claimed);
end;
$$;


revoke all on function public.irn_shared_cache_claim(text,integer) from public, anon, authenticated;
grant execute on function public.irn_shared_cache_claim(text,integer) to service_role;
