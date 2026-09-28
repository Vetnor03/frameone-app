# Pairing v2: private dormant staging foundation (2026-09-28)

**Scope:** a new, non-exposed `pairing_v2` schema and deliberately disabled `POST /api/device/pair/v2/start`. This is **not** physical enrollment or working pairing. No physical credentials are generated, imported or distributed.

## Isolation

- Deploy only to staging Supabase project `ouwhfzjaahdipwmelzvf`; this script is under `supabase/staging/`, **not** under the regular `supabase/migrations/` path that could later be replayed into production.
- The staging migration ledger currently consists of a snapshot baseline split into multiple migrations and ACL-parity migrations. Do not run `db push`, `db reset`, `migration repair`, or replay the old production history.
- `app/api/device/pair/v2/start` responds HTTP 503 with `pairing_v2_not_enabled` in the pinned staging deployment and HTTP 404 everywhere else. It has no database client, session minting or credential issuance.
- The three legacy pairing entry points stay quarantined **in staging**; `main`, live Supabase and existing physical firmware are unchanged.
- Existing Tester A/B virtual frames are not enrolled or modified. Neither test password nor any physical secret belongs in SQL, source, environment screenshots, URLs or logs.

## Private tables

`pairing_v2.device_credentials` holds one independently provisioned bootstrap-secret hash per device plus an optional hash of an ACKed, active device token. It references an existing `public.devices.device_id`; a public ID alone does not insert a row, generate a secret or prove physical possession.

`pairing_v2.pair_sessions` stores a UUID session, exact device binding, credential generation, **server-keyed HMAC** lookup digest for a short code, an independent polling-secret verifier, expiry/attempt/claim state and *optional* encrypted delivery storage. The encryption key and HMAC lookup key do not live in this database; encryption and expiry enforcement are future server work, not implemented by this schema.

Only verifiers and explicitly encrypted temporary delivery material have columns. The schema has no public API exposure, no `anon`/`authenticated`/`service_role` table or schema grants, RLS enabled with no policies, and no SECURITY DEFINER functions. Future access must use a separately reviewed narrowly scoped service-only RPC; never grant a whole private table to an app user.

An active-session uniqueness constraint refuses another live session or display-code collision until the earlier one is explicitly closed/expired. An expiration timestamp alone does not alter DB state; later code must expire stale sessions transactionally. Delivery plaintext cannot be stored without an encryption implementation and server-side key. The schema itself does not make stolen firmware secret storage safe.

## Actual staging application and verification

Applied the reviewed, additive SQL **only** to Supabase project `ouwhfzjaahdipwmelzvf`, migration `20260928194216_staging_pairing_v2_private_foundation_20260928`. The exact staging migration is recorded separately from the existing snapshot/ACL baseline; no `db push` or reset was used.

Post-migration catalog checks: the private schema exists, its `anon`, `authenticated` and `service_role` USAGE privileges are all **false**. Both tables have RLS enabled, zero policies, and zero DML grants to those roles. Both contain **zero records**. The two required live-session uniqueness indexes exist; there are zero v2 database functions and zero listed API grants. Both original tester frames, memberships and user accounts remain in place.

The Supabase security advisor reports `rls_enabled_no_policy` INFO for both private tables. This is intentional: without grants or policies they are deny-by-default, not user-owned Data API tables. It also reports existing security findings elsewhere in the baseline; they are a separate audit and not cleared by this slice. [RLS no policy advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

**Outstanding:** no bootstrap credential provisioned, no physical session created, no approved privileged RPC, no encryption/HMAC key deployed, no tested v2 client or firmware, and no production rollout. The v2 HTTP start endpoint stays disabled even though the staging schema exists.

## Acceptance before any v2 issuer is enabled

1. Verify CI tests and apply only the reviewed staging script through an explicitly selected staging project migration. Check every table, constraint, grant, RLS flag and zero row counts. The migration should not touch existing `public` data.
2. Verify anonymous and ordinary signed-in roles cannot use the private schema or tables, and no new service-role RPC is accessible.
3. Create a dedicated physically held **staging test frame** or supervised, deliberately switched test device. Do not reuse production credentials or pair by ID alone. Ensure firmware's validated TLS handles the staging host and staging Vercel protection without disabling the protection for the whole app.
4. Design server-only, rate-limited proof validation, transactionally bound start/claim/poll/ACK, collision handling, encryption with a separate key, expiry cleanup, replay/recovery and explicit revocation. Use disposable test credentials; do not call the legacy token-return route.
5. Enforce per-device v2 isolation at legacy database token-issuer functions and all physical auth routes before activating a v2 device. A backend-only rollback must never restore token disclosure for already migrated frames.

**Rollback of this slice:** Remove the disabled route and script from `development` to roll back code. An already applied private schema remains inert and empty; any later removal must be a separately reviewed staging-only migration, not an automatic destructive rollback. Do not roll back a future active v2 device to legacy token recovery.

**Production release gate:** real physical enrollment, real authenticated status reporting, pairing-v2 negative/positive tests and supervised pilot migration remain required.
