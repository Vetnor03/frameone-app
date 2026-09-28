# Pairing v2 — staging-only legacy quarantine (2026-09-28)

## Purpose and scope

This is a reversible first implementation slice, **not finished pairing v2**. It blocks legacy enrollment and credential disclosure in the isolated staging deployment while leaving `main`, production Supabase, existing production firmware, and the two original staging virtual frames alone.

The staging guard requires the exact independent Vercel project ID **and** exact staging Supabase URL/ref. A generic `VERCEL_ENV=preview` is insufficient. No migration, token generation, credential rotation, provisioning action, or device-status change belongs in this slice.

## Three legacy entry points

| Route | Staging behavior | Why it must be included |
| --- | --- | --- |
| `GET /api/device/pair/start` | HTTP 410, `legacy_pairing_disabled`, `Cache-Control: no-store`; no service-role client/RPC call | ID-only session creation |
| `GET /api/device/pair/status` | Same HTTP 410 before any database client/RPC | Legacy `device_pair_status` / `ensure_device_token` can return or mint a reusable bearer |
| `GET /api/device/frame-config` for an **unowned** device | Same HTTP 410 before `start_pairing` RPC | Third, easily missed path that can mint a pairing code from a bare ID |

An **owned** frame's `frame-config` path remains available but demands its existing device bearer. User-specific app status/config checks remain independent. All legacy behavior remains unchanged on the live Vercel project for compatibility during the supervised pilot.

## Safety boundaries and known gaps

- Do not direct a real frame at the staging URL yet: old firmware expects the three legacy paths. It will fail pairing there by design. It remains on its current production backend.
- Staging deployment protection currently requires browser login and may reject raw ESP32 requests. Do **not** simply disable staging protection to make the hardware connect; design a separate, narrowly scoped authenticated access path first.
- V2 bootstrap credentials must be installed through supervised physical/factory possession, not requested by anyone who knows the public device ID. Keep their secret material out of GET URLs, client-side bundles, logs, screenshots, and raw SQL output.
- Firmware TLS verification was implemented separately (see `tests/firmware-verified-tls.test.mjs`); the earlier design document's `setInsecure()` note is historical. Certificate/hostname/clock regression tests and staging-host compatibility still need physical acceptance.
- The quarantine is at the **Next.js routes only**. A review of direct RPC EXECUTE grants and all legacy token issuers is required before enabling v2 devices; do not claim that every internal service-role path is inaccessible.
- Existing firmware token-loss recovery remains insecure until physical v2 migration. Do not widen the pilot or merge the quarantine to `main` as a stand-alone "fix" for production.
- Do not call a legacy token issuer as a manual smoke test. The automated tests verify that the staging guard returns before the client/RPC; they also exercise legacy compatibility with mocked clients only.

## Next small independently testable slices

1. Decide the supervised staging-frame enrollment path. Use an **explicit test-only physical frame** and independently provision a unique, high-entropy bootstrap secret. Preserve its existing Wi-Fi when practical, but prevent production token/key crossover with isolated NVS storage or separate hardware. No user password, physical secret, or device bearer in chat.
2. Add a private, deny-by-default v2 credential/session schema in a clean local/disposable DB, RLS/grant checks, and a *disabled* v2 endpoint. Review migration history before applying anything to staging. No `db push`.
3. Build proof-bound v2 start/claim/status/ACK with expiry, rate limiting, atomic ownership and replay-safe bounded recovery; deny v1 issuer functions for activated v2 devices. Test every negative case with disposable identities.
4. Establish a secure device path through staging's Vercel protection without making app/staging public; then add staging firmware and verify physical pairing and status reports.
5. Only after physical and A/B acceptance, plan per-frame supervised production migration, then retire legacy paths and rotate exposed credentials. A backend-only rollback must never re-enable token disclosure for already-migrated v2 devices.

**Rollback of this slice:** revert the staging-only route guard and helper on `development`. No database or firmware rollback necessary. Production `main` remains unaffected.
