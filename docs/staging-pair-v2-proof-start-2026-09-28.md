# Pairing v2: proof-bound start implementation (2026-09-28)

**Scope:** staging-only, non-public start implementation and service-only database RPCs. This is the next small pairing-v2 slice, **not enabled enrollment**. No real device or test-user frame is enrolled, no live bootstrap secret, HMAC key or polling secret is provisioned, and the existing `POST /api/device/pair/v2/start` continues to answer 503 in staging and 404 outside staging.

## Trust boundary

A public `frm_...` device ID **never** establishes identity. A unique 256-bit bootstrap secret must first be provisioned over a trusted physical/factory process. The hash of that secret is stored in the already-private `pairing_v2.device_credentials` table. That secret must never be returned by ID lookup, passed in a URL, logged or sent to the customer app.

The server-only `startPairingV2` core validates canonical device-ID and proof format, retrieves only the eligible verifier through an explicitly service-role-only RPC, hashes the supplied physical secret and uses constant-time `timingSafeEqual` to authenticate it. The caller of this core (future HTTP handler) must extract proof from a dedicated Authorization header, enforce source/device rate limits, verify TLS and gate to the staging Vercel/Supabase pair. **That HTTP handler is intentionally not enabled in this slice.**

After proof, Node generates an unbiased four-character display code (32-character alphabet), computes a keyed HMAC lookup digest using a **separate, server-only key**, generates a 256-bit independent polling secret and sends only hashes/MAC to the database. The server keeps no raw bootstrap secret in stored session records. A successful response is intended for the *authenticated physical frame only* and contains a random session ID, display code, polling secret and 10-minute lifetime.

## Atomic SQL contract

The new `public.pair_v2_staging_verifier` and `public.pair_v2_staging_start` functions are SECURITY DEFINER with fixed empty search path. Both revoke the PostgreSQL default `PUBLIC` EXECUTE and grant EXECUTE exclusively to `service_role`. They do **not** grant direct schema/table access. The first returns a hash and generation for an eligible unowned/no-legacy-token device; the second rechecks eligibility, exact verifier and generation while locking the device and private credential rows, then explicitly expires stale sessions and inserts one new session. Unique live-session indexes remain the final safeguard against concurrent starts or display-code collisions.

The RPC is allowed to receive an expected verifier **hash**, never the plaintext secret. It must reject an already-owned device, a revoked bootstrap secret, activated v2 credentials, legacy device tokens and changed generation. It never creates a credential row. Code collisions retry with fresh material; a simultaneous already-active session does not silently rotate a polling secret.

`app/lib/device/pairingV2StartStore.ts` is a server-only adapter for the two RPCs, not a browser client. It converts validated 32-byte hashes to Postgres bytea and omits internal database errors from caller results.

## Actual staging acceptance

**Prerequisites:** merge the CI-green branch into `development`, then apply only `supabase/staging/pairing_v2_proof_start_20260928.sql` to Supabase project `ouwhfzjaahdipwmelzvf` through a targeted migration. No `db push`, reset, production history replay or legacy token issuer calls. Verify the two new RPC grants and inspect the private schema/table privileges. Only after that use a transaction-rolled-back synthetic device + generated ephemeral hash to test real database eligibility, duplicates and expiry without retaining secret material.

**Do not turn on the HTTP start endpoint after SQL acceptance.** The physical provisioning, protected Vercel device ingress, independent server HMAC key and source rate limit must be designed, tested and reviewed first. Pairing claim, bounded token delivery/ACK, v2-only token verification across *all* firmware endpoints and safe recovery remain separate slices. Keep the legacy pairing paths quarantined in staging and preserve existing production firmware unchanged.

## Verified staging result

The merged start core and its isolated RPC script are in `development` ([PR #1327](https://github.com/Vetnor03/frameone-app/pull/1327)). CI: **966/966 stable tests**, typecheck and changed-file lint passed; the separate full-audit jobs retain existing debt.

Applied only to staging Supabase project `ouwhfzjaahdipwmelzvf` as migration `20260928201440_staging_pairing_v2_proof_start_20260928`. Catalog verification: both new SECURITY DEFINER RPCs grant EXECUTE **only** to `service_role`; neither `anon` nor `authenticated` can execute them. The existing private tables still have no app/service Data API grants.

A transaction-scoped, synthetic disposable device and ephemeral verifier exercised the **actual PostgreSQL RPCs**: unknown/wrong verifier rejected, correct verifier created one session, repeated start rejected, expired session was explicitly closed and replaced, and revoked bootstrap credential prevented further verifier lookup and starts. The whole test transaction was rolled back. A subsequent independent query confirmed **zero** disposable devices, **zero** private credential/session rows, and both original tester frames and both tester accounts intact.

This verifies backend session-start invariants only. There is still no provisioned physical secret, no live server HMAC key, no active HTTP v2 start, no user-code claim, no poll/delivery/ACK or physical staging frame. Do not construe these tests as end-to-end enrollment.

## Rollback

The route stays disabled throughout. Revert the new code on `development` to stop using the service module. If applied, the two new RPCs remain service-only and inert with no credential/session rows; retire them through a separately reviewed staging-only migration, not a destructive blind rollback. Do not roll back a future activated v2 frame into the token-disclosing legacy path.
