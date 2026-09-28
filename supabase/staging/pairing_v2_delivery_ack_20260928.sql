-- STAGING ONLY: short-lived encrypted token delivery and proof-bound ACK.
-- Apply ONLY to staging project ouwhfzjaahdipwmelzvf after CI/review.
-- Creates no credentials, sessions, plaintext tokens, encryption keys or HTTP access.
-- All v2 HTTP routes remain disabled. DO NOT apply to production.
--
-- Security boundary: SQL stores an AES-256-GCM ciphertext and SHA-256 token
-- verifier only, never token plaintext. Node holds the independent AEAD key.
-- A separate trusted server checks the physical bootstrap and polling secrets
-- before passing their hashes to these SERVICE-ONLY RPCs.

-- Delivery/ACK can verify a previously claimed session, including an ACK
-- retry for an already acknowledged session; neither this lookup nor its
-- verifier is exposed to anon/authenticated or through a public HTTP route.
create function public.pair_v2_staging_delivery_verifier(
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
    and s.state in ('claimed', 'delivered', 'acknowledged')
    and d.owner_user_id = s.claimed_by_user_id
    and d.owner_user_id is not null
    and exists (
      select 1 from public.device_members m
      where m.device_id = c.device_id
        and m.user_id = d.owner_user_id
        and m.role = 'owner'
    );
$function$;

revoke all on function public.pair_v2_staging_delivery_verifier(text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.pair_v2_staging_delivery_verifier(text, uuid)
  to service_role;

create function public.pair_v2_staging_deliver(
  p_device_id text,
  p_session_id uuid,
  p_generation integer,
  p_expected_verifier bytea,
  p_polling_secret_hash bytea,
  p_candidate_token_hash bytea,
  p_candidate_envelope bytea
)
returns table(outcome text, encrypted_payload bytea, token_hash bytea)
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
  v_ttl timestamptz;
begin
  if p_device_id is null or p_device_id !~ '^frm_[A-F0-9]{12}$'
     or p_session_id is null
     or p_generation is null or p_generation < 1
     or octet_length(p_expected_verifier) <> 32
     or octet_length(p_polling_secret_hash) <> 32
     or octet_length(p_candidate_token_hash) <> 32
     -- Version(1) + nonce(12) + encrypted 256-bit token(32) + GCM tag(16).
     or octet_length(p_candidate_envelope) <> 61
     or get_byte(p_candidate_envelope, 0) <> 1
  then
    return query select 'unauthorized'::text, null::bytea, null::bytea;
    return;
  end if;

  -- Canonical lock order: devices -> credential -> session, as in start,
  -- claim and poll. Always recheck identity + ownership under these locks.
  select c.bootstrap_secret_hash, c.credential_generation, d.owner_user_id,
         d.device_token, d.device_token_hash, c.bootstrap_revoked_at,
         c.active_token_hash
    into v_verifier, v_generation, v_owner, v_legacy_token, v_legacy_hash,
         v_revoked, v_active_hash
  from public.devices d
  join pairing_v2.device_credentials c on c.device_id = d.device_id
  where d.device_id = p_device_id
  for update of d, c;

  if not found
     or v_verifier is distinct from p_expected_verifier
     or v_generation is distinct from p_generation
     or v_revoked is not null
     or v_active_hash is not null
     or v_legacy_token is not null or v_legacy_hash is not null
     or v_owner is null
     or not exists (
       select 1 from public.device_members m
       where m.device_id = p_device_id
         and m.user_id = v_owner and m.role = 'owner'
     )
  then
    return query select 'unauthorized'::text, null::bytea, null::bytea;
    return;
  end if;

  select s.* into v_session from pairing_v2.pair_sessions s
  where s.session_id = p_session_id and s.device_id = p_device_id
  for update;

  if not found
     or v_session.credential_generation is distinct from v_generation
     or v_session.polling_secret_hash is distinct from p_polling_secret_hash
     or v_session.claimed_by_user_id is distinct from v_owner
     or v_session.state not in ('claimed', 'delivered')
  then
    return query select 'unauthorized'::text, null::bytea, null::bytea;
    return;
  end if;

  -- Either lifetime ending invalidates undelivered/retry material.
  if v_session.expires_at <= now()
     or (v_session.encrypted_payload_expires_at is not null
         and v_session.encrypted_payload_expires_at <= now())
  then
    update pairing_v2.pair_sessions s
    set state = 'expired', closed_at = now(),
        pending_token_hash = null, encrypted_delivery_payload = null,
        encrypted_payload_expires_at = null
    where s.session_id = p_session_id;
    return query select 'expired'::text, null::bytea, null::bytea;
    return;
  end if;

  if v_session.state = 'delivered' then
    if v_session.delivery_attempt_count >= 3 then
      return query select 'retry_exhausted'::text, null::bytea, null::bytea;
      return;
    end if;

    -- Lost-response retry: return the SAME ciphertext, not the new candidate.
    -- Only a frame that passes both independent physical/session proofs can
    -- receive it through the future handler. Never disclose ciphertext to app.
    update pairing_v2.pair_sessions s
    set delivery_attempt_count = s.delivery_attempt_count + 1
    where s.session_id = p_session_id;
    return query
      select 'delivered'::text, v_session.encrypted_delivery_payload,
             v_session.pending_token_hash;
    return;
  end if;

  if v_session.pending_token_hash is not null
     or v_session.encrypted_delivery_payload is not null
     or v_session.delivery_attempt_count <> 0
  then
    return query select 'unauthorized'::text, null::bytea, null::bytea;
    return;
  end if;

  v_ttl := least(v_session.expires_at, now() + interval '3 minutes');
  update pairing_v2.pair_sessions s
  set state = 'delivered',
      delivered_at = now(),
      delivery_attempt_count = 1,
      pending_token_hash = p_candidate_token_hash,
      encrypted_delivery_payload = p_candidate_envelope,
      encrypted_payload_expires_at = v_ttl
  where s.session_id = p_session_id and s.state = 'claimed';

  if not found then
    raise exception 'delivery transition conflict';
  end if;

  return query
    select 'delivered'::text, p_candidate_envelope, p_candidate_token_hash;
end;
$function$;

revoke all on function public.pair_v2_staging_deliver(
  text, uuid, integer, bytea, bytea, bytea, bytea
) from public, anon, authenticated, service_role;
grant execute on function public.pair_v2_staging_deliver(
  text, uuid, integer, bytea, bytea, bytea, bytea
) to service_role;

create function public.pair_v2_staging_ack(
  p_device_id text,
  p_session_id uuid,
  p_generation integer,
  p_expected_verifier bytea,
  p_polling_secret_hash bytea,
  p_presented_token_hash bytea
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
  if p_device_id is null or p_device_id !~ '^frm_[A-F0-9]{12}$'
     or p_session_id is null
     or p_generation is null or p_generation < 1
     or octet_length(p_expected_verifier) <> 32
     or octet_length(p_polling_secret_hash) <> 32
     or octet_length(p_presented_token_hash) <> 32
  then
    return query select 'unauthorized'::text;
    return;
  end if;

  select c.bootstrap_secret_hash, c.credential_generation, d.owner_user_id,
         d.device_token, d.device_token_hash, c.bootstrap_revoked_at,
         c.active_token_hash
    into v_verifier, v_generation, v_owner, v_legacy_token, v_legacy_hash,
         v_revoked, v_active_hash
  from public.devices d
  join pairing_v2.device_credentials c on c.device_id = d.device_id
  where d.device_id = p_device_id
  for update of d, c;

  if not found
     or v_verifier is distinct from p_expected_verifier
     or v_generation is distinct from p_generation
     or v_legacy_token is not null or v_legacy_hash is not null
     or v_owner is null
     or not exists (
       select 1 from public.device_members m
       where m.device_id = p_device_id
         and m.user_id = v_owner and m.role = 'owner'
     )
  then
    return query select 'unauthorized'::text;
    return;
  end if;

  select s.* into v_session from pairing_v2.pair_sessions s
  where s.session_id = p_session_id and s.device_id = p_device_id
  for update;

  if not found
     or v_session.credential_generation is distinct from v_generation
     or v_session.polling_secret_hash is distinct from p_polling_secret_hash
     or v_session.claimed_by_user_id is distinct from v_owner
  then
    return query select 'unauthorized'::text;
    return;
  end if;

  -- A lost ACK response may be repeated ONLY with the same proofs and the
  -- previously activated token hash. No token or ciphertext is returned.
  if v_session.state = 'acknowledged' then
    if v_active_hash is not distinct from p_presented_token_hash
       and v_active_hash is not null
       and v_session.acknowledged_at is not null
    then
      return query select 'already_acknowledged'::text;
      return;
    end if;
    return query select 'unauthorized'::text;
    return;
  end if;

  if v_revoked is not null
     or v_active_hash is not null
     or v_session.state <> 'delivered'
     or v_session.expires_at <= now()
     or v_session.encrypted_payload_expires_at is null
     or v_session.encrypted_payload_expires_at <= now()
     or v_session.pending_token_hash is distinct from p_presented_token_hash
     or v_session.encrypted_delivery_payload is null
  then
    return query select 'unauthorized'::text;
    return;
  end if;

  -- The frame must persist the delivered token before ACK. This activation
  -- is DB-atomic; later API code must authenticate hash-only v2 tokens across
  -- ALL firmware routes before any actual physical device can use it.
  update pairing_v2.device_credentials c
  set active_token_hash = p_presented_token_hash,
      active_token_at = now(),
      bootstrap_revoked_at = now()
  where c.device_id = p_device_id
    and c.active_token_hash is null and c.bootstrap_revoked_at is null;

  if not found then raise exception 'ACK activation conflict'; end if;

  update public.devices d
  set paired_at = coalesce(d.paired_at, now())
  where d.device_id = p_device_id and d.owner_user_id = v_owner;
  if not found then raise exception 'ACK ownership conflict'; end if;

  update pairing_v2.pair_sessions s
  set state = 'acknowledged', acknowledged_at = now(), closed_at = now(),
      pending_token_hash = null,
      encrypted_delivery_payload = null,
      encrypted_payload_expires_at = null
  where s.session_id = p_session_id and s.state = 'delivered';
  if not found then raise exception 'ACK session conflict'; end if;

  return query select 'acknowledged'::text;
end;
$function$;

revoke all on function public.pair_v2_staging_ack(
  text, uuid, integer, bytea, bytea, bytea
) from public, anon, authenticated, service_role;
grant execute on function public.pair_v2_staging_ack(
  text, uuid, integer, bytea, bytea, bytea
) to service_role;
