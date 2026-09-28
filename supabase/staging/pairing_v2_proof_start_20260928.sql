-- STAGING ONLY: private verifier lookup and atomic proof-bound session opening.
-- Applied only to Supabase project ouwhfzjaahdipwmelzvf after CI review.
-- Creates no credentials, sessions, plaintext codes or backend keys by itself.
-- Service-role RPC entry points are not accessible by anon/authenticated.
-- The HTTP start route remains disabled until supervised physical provisioning.

create function public.pair_v2_staging_verifier(p_device_id text)
returns table(verifier bytea, generation integer)
language sql
stable
security definer
set search_path = ''
as $function$
  select c.bootstrap_secret_hash, c.credential_generation
  from pairing_v2.device_credentials c
  join public.devices d on d.device_id = c.device_id
  where c.device_id = p_device_id
    and c.bootstrap_revoked_at is null
    and c.active_token_hash is null
    and d.owner_user_id is null
    and d.device_token is null
    and d.device_token_hash is null
    and not exists (
      select 1 from public.device_members m where m.device_id = c.device_id
    );
$function$;

revoke all on function public.pair_v2_staging_verifier(text)
  from public, anon, authenticated, service_role;
grant execute on function public.pair_v2_staging_verifier(text) to service_role;

create function public.pair_v2_staging_start(
  p_device_id text,
  p_generation integer,
  p_expected_verifier bytea,
  p_display_code_mac bytea,
  p_polling_secret_hash bytea
)
returns table(outcome text, session_id uuid)
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
  v_legacy_token_hash text;
  v_revoked timestamptz;
  v_active_hash bytea;
  v_session_id uuid;
begin
  if p_device_id is null
     or p_device_id !~ '^frm_[A-F0-9]{12}$'
     or p_generation is null
     or p_generation < 1
     or octet_length(p_expected_verifier) <> 32
     or octet_length(p_display_code_mac) <> 32
     or octet_length(p_polling_secret_hash) <> 32
  then
    return query select 'ineligible'::text, null::uuid;
    return;
  end if;

  -- Lock the canonical frame row as well as its verifier row; the same
  -- transaction must recheck eligibility and the generation before insert.
  select c.bootstrap_secret_hash, c.credential_generation,
         d.owner_user_id, d.device_token, d.device_token_hash,
         c.bootstrap_revoked_at, c.active_token_hash
    into v_verifier, v_generation, v_owner, v_legacy_token,
         v_legacy_token_hash, v_revoked, v_active_hash
  from public.devices d
  join pairing_v2.device_credentials c on c.device_id = d.device_id
  where d.device_id = p_device_id
  for update of d, c;

  if not found
     or v_verifier is distinct from p_expected_verifier
     or v_generation is distinct from p_generation
     or v_owner is not null
     or v_legacy_token is not null
     or v_legacy_token_hash is not null
     or v_revoked is not null
     or v_active_hash is not null
     or exists (
       select 1 from public.device_members m where m.device_id = p_device_id
     )
  then
    return query select 'ineligible'::text, null::uuid;
    return;
  end if;

  -- Expiration is explicit state, not an index predicate using now().
  -- Clear pending delivery material on terminal expiration.
  update pairing_v2.pair_sessions s
  set state = 'expired',
      closed_at = now(),
      pending_token_hash = null,
      encrypted_delivery_payload = null,
      encrypted_payload_expires_at = null
  where s.device_id = p_device_id
    and s.state in ('pending', 'claimed', 'delivered')
    and s.expires_at <= now();

  if exists (
    select 1 from pairing_v2.pair_sessions s
    where s.device_id = p_device_id
      and s.state in ('pending', 'claimed', 'delivered')
  ) then
    return query select 'already_active'::text, null::uuid;
    return;
  end if;

  insert into pairing_v2.pair_sessions (
    device_id, credential_generation, display_code_mac,
    polling_secret_hash, expires_at
  ) values (
    p_device_id, p_generation, p_display_code_mac,
    p_polling_secret_hash, now() + interval '10 minutes'
  )
  on conflict do nothing
  returning pairing_v2.pair_sessions.session_id into v_session_id;

  if v_session_id is null then
    return query select 'collision'::text, null::uuid;
    return;
  end if;

  return query select 'created'::text, v_session_id;
end;
$function$;

revoke all on function public.pair_v2_staging_start(text, integer, bytea, bytea, bytea)
  from public, anon, authenticated, service_role;
grant execute on function public.pair_v2_staging_start(text, integer, bytea, bytea, bytea)
  to service_role;
