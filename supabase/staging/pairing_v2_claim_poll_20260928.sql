-- STAGING ONLY: atomic claim and proof-bound state-only poll.
-- Apply ONLY to Supabase project ouwhfzjaahdipwmelzvf after CI review.
-- This creates NO bootstrap credentials, pairing sessions, HMAC keys, tokens,
-- HTTP activation, or raw secrets. No production migration replay.
-- Both HTTP claim and status endpoints remain deliberately disabled.

create table pairing_v2.claim_attempts (
  scope text not null check (scope in ('account', 'network')),
  -- Keyed server-side HMAC of verified user UUID or trusted network source.
  -- Neither raw IP nor raw account ID is stored in this table.
  bucket_mac bytea not null check (octet_length(bucket_mac) = 32),
  window_start timestamptz not null,
  attempt_count integer not null default 0 check (attempt_count between 0 and 1000000),
  primary key (scope, bucket_mac, window_start)
);

alter table pairing_v2.claim_attempts enable row level security;
revoke all on pairing_v2.claim_attempts from public, anon, authenticated, service_role;
comment on table pairing_v2.claim_attempts is
  'Private fixed-window claim throttle. API roles have no access. Cleanup old windows separately.';

create function public.pair_v2_staging_claim(
  p_user_id uuid,
  p_code_mac bytea,
  p_account_mac bytea,
  p_network_mac bytea
)
returns table(outcome text)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_window timestamptz := date_bin('10 minutes', now(), '2000-01-01 00:00:00+00'::timestamptz);
  v_account_count integer;
  v_network_count integer;
  v_device_id text;
  v_session pairing_v2.pair_sessions%rowtype;
  v_owner uuid;
  v_token text;
  v_token_hash text;
  v_generation integer;
  v_revoked timestamptz;
  v_active_hash bytea;
begin
  -- No caller-controlled user ID can bypass the verified JWT check in the
  -- future server handler. This RPC is service-role-only, not user-callable.
  if p_user_id is null
     or octet_length(p_code_mac) <> 32
     or octet_length(p_account_mac) <> 32
     or octet_length(p_network_mac) <> 32
     or not exists (select 1 from auth.users u where u.id = p_user_id)
  then
    return query select 'invalid'::text;
    return;
  end if;

  -- Count *all* guesses, including non-existent codes. An unknown short code
  -- has no session row to increment. Concurrent guesses share row locks via
  -- INSERT ON CONFLICT DO UPDATE. Account lock is always acquired first.
  insert into pairing_v2.claim_attempts(scope, bucket_mac, window_start, attempt_count)
  values ('account', p_account_mac, v_window, 1)
  on conflict (scope, bucket_mac, window_start)
  do update set attempt_count = least(1000000, pairing_v2.claim_attempts.attempt_count + 1)
  returning pairing_v2.claim_attempts.attempt_count into v_account_count;

  if v_account_count > 5 then
    return query select 'rate_limited'::text;
    return;
  end if;

  insert into pairing_v2.claim_attempts(scope, bucket_mac, window_start, attempt_count)
  values ('network', p_network_mac, v_window, 1)
  on conflict (scope, bucket_mac, window_start)
  do update set attempt_count = least(1000000, pairing_v2.claim_attempts.attempt_count + 1)
  returning pairing_v2.claim_attempts.attempt_count into v_network_count;

  if v_network_count > 30 then
    return query select 'rate_limited'::text;
    return;
  end if;

  -- Read without lock to obtain the candidate ID. Lock the canonical device
  -- and credential rows FIRST (same order as start and poll), then lock and
  -- re-check the session. Concurrent claims cannot both win.
  select s.device_id into v_device_id
  from pairing_v2.pair_sessions s
  where s.display_code_mac = p_code_mac
    and s.state = 'pending'
    and s.expires_at > now()
  limit 1;

  if v_device_id is null then
    return query select 'invalid'::text;
    return;
  end if;

  select d.owner_user_id, d.device_token, d.device_token_hash,
         c.credential_generation, c.bootstrap_revoked_at, c.active_token_hash
    into v_owner, v_token, v_token_hash,
         v_generation, v_revoked, v_active_hash
  from public.devices d
  join pairing_v2.device_credentials c on c.device_id = d.device_id
  where d.device_id = v_device_id
  for update of d, c;

  if not found
     or v_owner is not null
     or v_token is not null
     or v_token_hash is not null
     or v_revoked is not null
     or v_active_hash is not null
     or exists (select 1 from public.device_members m where m.device_id = v_device_id)
  then
    return query select 'invalid'::text;
    return;
  end if;

  select s.* into v_session
  from pairing_v2.pair_sessions s
  where s.device_id = v_device_id
    and s.display_code_mac = p_code_mac
  for update;

  if not found
     or v_session.state <> 'pending'
     or v_session.expires_at <= now()
     or v_session.credential_generation is distinct from v_generation
     or v_session.attempt_count >= 5
  then
    return query select 'invalid'::text;
    return;
  end if;

  -- Ownership and session transition are atomic. No device bearer is minted
  -- or delivered here; paired_at and device_token remain unchanged until ACK.
  update public.devices d
  set owner_user_id = p_user_id
  where d.device_id = v_device_id
    and d.owner_user_id is null;

  if not found then
    return query select 'invalid'::text;
    return;
  end if;

  insert into public.device_members(device_id, user_id, role)
  values (v_device_id, p_user_id, 'owner');

  update pairing_v2.pair_sessions s
  set state = 'claimed',
      claimed_by_user_id = p_user_id,
      claimed_at = now(),
      attempt_count = s.attempt_count + 1
  where s.session_id = v_session.session_id
    and s.state = 'pending';

  if not found then
    raise exception 'claim transition conflict';
  end if;

  return query select 'claimed'::text;
end;
$function$;

revoke all on function public.pair_v2_staging_claim(uuid, bytea, bytea, bytea)
  from public, anon, authenticated, service_role;
grant execute on function public.pair_v2_staging_claim(uuid, bytea, bytea, bytea)
  to service_role;

-- A private verifier lookup for device-only polling. It does not reveal any
-- session contents, user data, tokens or secrets and requires exact session ID.
create function public.pair_v2_staging_poll_verifier(
  p_device_id text,
  p_session_id uuid
)
returns table(verifier bytea, generation integer)
language sql
stable
security definer
set search_path = ''
as $function$
  select c.bootstrap_secret_hash, c.credential_generation
  from pairing_v2.device_credentials c
  join public.devices d on d.device_id = c.device_id
  join pairing_v2.pair_sessions s on s.device_id = c.device_id
  where c.device_id = p_device_id
    and s.session_id = p_session_id
    and s.credential_generation = c.credential_generation
    and s.state in ('pending', 'claimed')
    and c.bootstrap_revoked_at is null
    and c.active_token_hash is null
    and d.device_token is null
    and d.device_token_hash is null;
$function$;

revoke all on function public.pair_v2_staging_poll_verifier(text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.pair_v2_staging_poll_verifier(text, uuid)
  to service_role;

create function public.pair_v2_staging_poll(
  p_device_id text,
  p_session_id uuid,
  p_generation integer,
  p_expected_verifier bytea,
  p_polling_secret_hash bytea
)
returns table(outcome text)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_verifier bytea;
  v_generation integer;
  v_owner uuid;
  v_legacy_token text;
  v_legacy_hash text;
  v_revoked timestamptz;
  v_active_hash bytea;
  v_session pairing_v2.pair_sessions%rowtype;
begin
  if p_device_id is null
     or p_session_id is null
     or p_generation is null or p_generation < 1
     or octet_length(p_expected_verifier) <> 32
     or octet_length(p_polling_secret_hash) <> 32
  then
    return query select 'unauthorized'::text;
    return;
  end if;

  select c.bootstrap_secret_hash, c.credential_generation,
         d.owner_user_id, d.device_token, d.device_token_hash,
         c.bootstrap_revoked_at, c.active_token_hash
    into v_verifier, v_generation, v_owner, v_legacy_token,
         v_legacy_hash, v_revoked, v_active_hash
  from public.devices d
  join pairing_v2.device_credentials c on c.device_id = d.device_id
  where d.device_id = p_device_id
  for update of d, c;

  if not found
     or v_verifier is distinct from p_expected_verifier
     or v_generation is distinct from p_generation
     or v_revoked is not null
     or v_active_hash is not null
     or v_legacy_token is not null
     or v_legacy_hash is not null
  then
    return query select 'unauthorized'::text;
    return;
  end if;

  select s.* into v_session
  from pairing_v2.pair_sessions s
  where s.session_id = p_session_id
    and s.device_id = p_device_id
  for update;

  if not found
     or v_session.credential_generation is distinct from v_generation
     or v_session.polling_secret_hash is distinct from p_polling_secret_hash
     or v_session.state not in ('pending', 'claimed')
  then
    return query select 'unauthorized'::text;
    return;
  end if;

  if v_session.expires_at <= now() then
    update pairing_v2.pair_sessions s
    set state = 'expired', closed_at = now(),
        pending_token_hash = null,
        encrypted_delivery_payload = null,
        encrypted_payload_expires_at = null
    where s.session_id = p_session_id;
    return query select 'expired'::text;
    return;
  end if;

  if v_session.state = 'pending' then
    if v_owner is not null
       or exists (select 1 from public.device_members m where m.device_id = p_device_id)
    then
      return query select 'unauthorized'::text;
      return;
    end if;
    return query select 'pending'::text;
    return;
  end if;

  if v_owner is distinct from v_session.claimed_by_user_id
     or v_owner is null
     or not exists (
       select 1 from public.device_members m
       where m.device_id = p_device_id
         and m.user_id = v_owner
         and m.role = 'owner'
     )
  then
    return query select 'unauthorized'::text;
    return;
  end if;

  -- State-only poll. No token, no user ID, no device configuration is returned.
  return query select 'claimed'::text;
end;
$function$;

revoke all on function public.pair_v2_staging_poll(text, uuid, integer, bytea, bytea)
  from public, anon, authenticated, service_role;
grant execute on function public.pair_v2_staging_poll(text, uuid, integer, bytea, bytea)
  to service_role;
