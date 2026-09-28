# Pairing v2 — hash-only physical auth and legacy issuance guards (staging, 2026-09-28)

**Scope:** Next.js authentication and database safeguards on the isolated staging Vercel/Supabase pair. This prepares a frame *after* ACK, but does **not** enable any v2 HTTP endpoint, provision a secret, modify physical firmware, or alter production `main`.

## Physical bearer protocol

The dormant v2 delivery core generates 32 random **bytes** and serializes them as 64 hexadecimal characters for the frame. Its SHA-256 verifier is over the original **32 decoded bytes**, not the ASCII characters. `authenticatePhysicalDevice` now delegates on staging to service-role-only `pair_v2_staging_device_auth_mode`. When a device has a private v2 credential row, acceptance requires its exact active hash, ACK/activation timestamp, bootstrap revocation, canonical owner membership and **null legacy token columns**. A wrong, revoked, malformed or not-yet-activated v2 device is rejected without falling back to legacy auth.

Only devices with **no v2 credential row** may use the unchanged legacy `devices.device_token` behavior. The independent production project never calls this staging-only RPC. Failure or an unexpected result fails closed rather than skipping the check.

The route audit uncovered direct legacy checks in Assistant, Groceries, Refresh, Ski and Stocks; these are brought through the common helper too. Ski retains its separate, existing authenticated user/member path; that is not physical-device impersonation. Central authentication also covers existing frame-config, content-signature/revision, telemetry, render-state, surf and update-state routes. **This is source/DB testing, not real firmware acceptance.**

## Staging SQL defenses

The new hash-only auth RPC is SECURITY DEFINER with an empty search path and EXECUTE for service role only. Existing `ensure_device_token`, `set_device_token`, `device_pair_status`, `start_pairing`, `claim_pair_code` and `create_member_pair_code` are recreated with v2-presence guards; their existing non-v2 behavior and grants are preserved. No public or app-user direct access to private v2 tables is introduced. A trigger also blocks legacy bearer/hash writes on any v2 device row, even through a separate privileged code path.

To prevent silent re-enrollment following the old app's delete/reset workflow, ownership clearing/transfers on a claimed v2 device and physical row deletion are blocked until a reviewed v2 revocation/tombstone lifecycle exists. Unowned provisioned devices can still be claimed through the previously tested atomic v2 claim RPC. Existing legacy devices without a private v2 row are unaffected. Deleting a future migrated device may temporarily be **unavailable** rather than silently discarding its credential—this must be integrated into the user experience before real migration.

The staging legacy HTTP pairing routes remain quarantined. These database guards are a defense even if another service-role route accidentally calls an older RPC. Privileged database operators could still intentionally delete private credentials; the future revocation design must address operational controls and audit logging.

## Test contract

CI must pass stable tests, typecheck and changed-file lint. Review and apply only `supabase/staging/pairing_v2_physical_auth_issuer_guards_20260928.sql` through a targeted migration to **`ouwhfzjaahdipwmelzvf`**—never `db push`, `db reset`, or production migration replay.

In a single rolled-back transaction use **new** synthetic IDs and ephemeral hashes to test before ACK (deny), correct active v2 hash (accept), wrong v2 hash (deny), missing owner/member/revocation state (deny), legacy token issuer functions (deny), legacy bearer updates (deny), and old reset/deletion rejection. Separately test ordinary legacy devices without v2 rows retain the prior auth/issuance behavior. Confirm zero synthetic records remain and both existing Tester A/B virtual frames remain intact. Never expose raw tokens or bootstrap secrets in SQL results/logs.

All five `/api/device/pair/v2/{start,claim,status,deliver,ack}` HTTP endpoints must remain hard-disabled in staging; no physical credential should be issued until protected ingress, physical firmware, the actual ESP32 positive test, and revocation lifecycle are ready.

## Verified staging acceptance

[PR #1331](https://github.com/Vetnor03/frameone-app/pull/1331) merged to `development` after **996/996 stable tests**, typecheck and changed-file lint passed. The separate full audit still reports previously documented debt. The initial migration attempt encountered a SQL terminator syntax error and made **no database change**: the auth RPC and new triggers were absent and the migration ledger unchanged. [PR #1332](https://github.com/Vetnor03/frameone-app/pull/1332) corrected the six copied function terminators and added a syntax regression test; CI again passed **996/996**, typecheck and changed-file lint.

The corrected SQL was validated inside a rolled-back staging transaction, then applied only to Supabase project `ouwhfzjaahdipwmelzvf` as migration `20260928211944_staging_pairing_v2_physical_auth_issuer_guards_20260928`. Catalog inspection confirmed the new auth-mode RPC is SECURITY DEFINER with EXECUTE for service role only, and the three defensive triggers are installed. No v2 credentials were inserted.

A separate rolled-back synthetic device test exercised the actual database: exact active v2 hash accepted; wrong hash, unactivated record, missing owner membership and unknown ID denied; all known legacy issuer functions and direct bearer/hash writes refused v2 records; a v2 owner's legacy reset and row deletion were blocked; and ordinary legacy token issuance, pair status and unowned start still worked for devices without a v2 record. A synthetic v2 member-share/claim code was also rejected.

A fresh post-rollback query confirmed **zero** v2 credentials, sessions, claim buckets, disposable devices, memberships and pairing codes. Both original virtual test frames, their memberships and both tester accounts remain intact.

The new auth pathway has **unit/mock and real SQL acceptance**, but has **not yet been exercised by a live physical staging device with a valid v2 bearer**. No v2 HTTP enrollment/delivery endpoints are enabled and no real frame was flashed. The old app's owner-delete/reset is intentionally blocked for any future v2-provisioned frame until a supervised revocation and tombstone flow is ready. Do not promote this state into a production rollout on its own.

## Rollback

Revert the **staging app** branch to restore legacy behavior for ordinary v1 frames. Database guards may be retired through a separately reviewed staging-only migration while **zero real v2 frames** exist. Do not roll back a future activated v2 frame into a token-disclosing legacy path. Production, real hardware and firmware are explicitly out of scope.
