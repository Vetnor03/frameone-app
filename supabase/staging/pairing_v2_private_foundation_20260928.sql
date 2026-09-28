-- STAGING-ONLY REVIEWED FOUNDATION.
-- Do not add this file to supabase/migrations or replay production history.
-- No bootstrap secrets, tokens, display codes or encryption keys are inserted.
-- Not a live pairing flow: no API/RPC grants, no enrollment, no tokens minted.
--
-- Deploy ONLY through an explicitly targeted migration on staging
-- Supabase project ouwhfzjaahdipwmelzvf after CI and review.

create schema pairing_v2;
comment on schema pairing_v2 is
  'Private, dormant pairing-v2 credential/session data; not in exposed API schemas.';

revoke all on schema pairing_v2 from public, anon, authenticated, service_role;

create table pairing_v2.device_credentials (
  device_id text primary key
    references public.devices(device_id) on delete cascade,
  -- SHA-256 verifier for a unique, at least 256-bit bootstrap secret
  -- installed through supervised physical/factory enrollment. Never raw secret.
  bootstrap_secret_hash bytea not null
    check (octet_length(bootstrap_secret_hash) = 32),
  credential_generation integer not null default 1
    check (credential_generation > 0),
  bootstrap_revoked_at timestamptz,
  -- Filled only after a verified, ACKed physical activation. No legacy tokens.
  active_token_hash bytea
    check (active_token_hash is null or octet_length(active_token_hash) = 32),
  active_token_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (active_token_hash is null and active_token_at is null) or
    (active_token_hash is not null and active_token_at is not null)
  )
);

create table pairing_v2.pair_sessions (
  session_id uuid primary key default gen_random_uuid(),
  device_id text not null
    references pairing_v2.device_credentials(device_id) on delete cascade,
  credential_generation integer not null check (credential_generation > 0),
  -- Server-keyed HMAC digest of the short display code; NEVER its plaintext
  -- or an unkeyed digest that can be brute-forced after DB disclosure.
  display_code_mac bytea not null check (octet_length(display_code_mac) = 32),
  -- SHA-256 verifier for an independent 256-bit, frame-only polling secret.
  polling_secret_hash bytea not null
    check (octet_length(polling_secret_hash) = 32),
  state text not null default 'pending'
    check (state in ('pending', 'claimed', 'delivered', 'acknowledged', 'expired', 'cancelled')),
  attempt_count smallint not null default 0
    check (attempt_count between 0 and 5),
  delivery_attempt_count smallint not null default 0
    check (delivery_attempt_count between 0 and 3),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_by_user_id uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  delivered_at timestamptz,
  acknowledged_at timestamptz,
  closed_at timestamptz,
  -- Optional only after authenticated claim; encrypted by a separate
  -- server-only key, bounded to this session, erased on ACK/expiry.
  pending_token_hash bytea
    check (pending_token_hash is null or octet_length(pending_token_hash) = 32),
  encrypted_delivery_payload bytea,
  encrypted_payload_expires_at timestamptz,
  check (expires_at > created_at and expires_at <= created_at + interval '10 minutes'),
  check (
    (encrypted_delivery_payload is null and encrypted_payload_expires_at is null) or
    (encrypted_delivery_payload is not null and encrypted_payload_expires_at is not null)
  ),
  check (encrypted_payload_expires_at is null or encrypted_payload_expires_at <= expires_at),
  check (claimed_by_user_id is null or claimed_at is not null),
  check (pending_token_hash is not null or encrypted_delivery_payload is null)
);

-- Fail closed if an expired session was not yet explicitly marked expired:
-- cleanup/expiry must be resolved before a new session can be inserted.
create unique index pair_v2_one_live_session_per_device
  on pairing_v2.pair_sessions(device_id)
  where state in ('pending', 'claimed', 'delivered');

-- A short code may be reused after a closed session, but never while live.
create unique index pair_v2_one_live_session_per_code
  on pairing_v2.pair_sessions(display_code_mac)
  where state in ('pending', 'claimed', 'delivered');

create index pair_v2_sessions_expiry
  on pairing_v2.pair_sessions(expires_at);
create index pair_v2_sessions_claimed_user
  on pairing_v2.pair_sessions(claimed_by_user_id)
  where claimed_by_user_id is not null;

-- Defense in depth. No public, anon, authenticated OR service_role policies.
-- Later server access requires a narrowly reviewed service-role-only RPC,
-- never a blanket schema/Data API exposure.
alter table pairing_v2.device_credentials enable row level security;
alter table pairing_v2.pair_sessions enable row level security;
revoke all on all tables in schema pairing_v2
  from public, anon, authenticated, service_role;
revoke all on all sequences in schema pairing_v2
  from public, anon, authenticated, service_role;
revoke all on all functions in schema pairing_v2
  from public, anon, authenticated, service_role;

alter default privileges for role postgres in schema pairing_v2
  revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema pairing_v2
  revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema pairing_v2
  revoke all on functions from public, anon, authenticated, service_role;
