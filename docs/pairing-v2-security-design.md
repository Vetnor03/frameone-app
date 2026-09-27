# Pairing-v2 security design and rollout gate

Status: design contract; no production behaviour is changed by this document. Verified against `main` and read-only production RPC metadata on 2026-09-27.

## Current dependency and risks

- `frame/src/network/BackendApi.cpp::pairStatus` calls `GET /api/device/pair/status?device_id=...` without authentication. `frame/src/frame_v2.5.1.ino::ensurePairedNoReboot` polls it both before creating a code (token-loss recovery) and while waiting for a claim, then saves `device_token` in NVS.
- `app/api/device/pair/status/route.ts` uses `service_role`, calls `device_pair_status(p_device_id)` as fallback, and returns the RPC row unchanged. Production `device_pair_status` returns `paired, device_token`, via `ensure_device_token`. Its direct RPC grant is service-role-only; the public Next.js route is the exposure.
- `GET /api/device/pair/start` calls `start_pairing(p_device_id)` based only on a claimed device ID. The RPC checks existing ownership but cannot prove that a new request came from the physical frame. A new status credential alone does not solve device-ID impersonation or fraudulent first claims.
- `frame/src/network/NetClient.cpp` currently calls `WiFiClientSecure::setInsecure()`. Do not transmit new enrollment credentials until the firmware validates the server certificate and hostname.
- `/api/device/frame-config` now authenticates paired-frame configuration (PR #1312), but it does not make either legacy pairing endpoint safe.

The existing unauthenticated status route **must not be disabled in isolation**: legacy firmware uses it to obtain its first token and to recover when the NVS token is missing. The legacy route must nevertheless be removed, not kept as a silent fallback, before user expansion.

## Security invariant

A public device ID and a four-character display code are identifiers / user-entry conveniences, not device credentials. A credential is delivered only over a TLS-verified connection authenticated with a device-specific secret enrolled through a trusted physical or factory process. Knowing another device's ID must not allow an attacker to generate a claimable session, take ownership, observe a token, rotate a token, or access frame data.

New manufacturing units: provision a unique high-entropy device bootstrap credential through a trusted process; store only a verifier/hash server-side, retain the secret in frame NVS (with flash/enrollment safeguards), and never expose it through a device-ID lookup. This is an authentication secret, not a pairing code. Review ESP32-S3 flash encryption / secure boot before production.

Existing *already-paired* pilot units: an existing bearer may be used to request a migration workflow, but it was exposed by the legacy status route and therefore does **not** independently prove physical possession. Completing migration and rotating credentials requires fresh, short-lived physical confirmation (e.g. trusted local AP/USB enrollment and a displayed challenge tied to the live frame). Do not offer a remote bearer-only v2 credential takeover path.

Existing *unpaired* legacy units: supervised physical enrollment / re-provisioning is required. An API call containing only `device_id`, or a fresh server-issued secret returned to that caller, cannot bootstrap trust. Support recovery without changing Wi-Fi credentials where possible.

## Target v2 contract (design, not yet implemented)

1. **Enroll / authorize frame identity.** The server has a verifier for a per-frame bootstrap secret obtained through a trusted process. Frame connects using validated TLS. A bare ID cannot create or inspect a v2 session. Enrollment and credential rotation require physical confirmation, and owner/account authorization where appropriate.
2. **Start session.** `POST /api/device/pair/v2/start` authenticates the device bootstrap proof, checks the device is eligible to pair, and creates a short-lived random session ID, an independent high-entropy polling secret, and a display code. Bind all three to the same device and session. Return code and session material to the authenticated frame only; show only the short code to the customer.
3. **Claim session.** The signed-in app submits the displayed code over `POST`, with rate limits by account/IP and code-attempt lockout. Resolve the live session transactionally. Only an unowned frame can be initially claimed; sharing uses a separately authorized owner/member workflow. A successful claim atomically creates membership and marks the session claimed. No device bearer goes to the app.
4. **Deliver token.** `POST /api/device/pair/v2/status` requires device proof *and* the session polling proof, not merely a device ID or display code. Only the exact claimed session can receive its new random device token. Persist the token verifier/hash for subsequent API auth. Handle a lost HTTP response through a bounded, same-session retry-until-ACK mechanism; after ACK, never replay the bearer. Any temporary recoverable token material must be encrypted at rest, TTL-limited, and inaccessible via Data API or logs. Never use a query string for secrets.
5. **Activate.** The frame saves the new token, confirms it can authenticate `frame-config`, then ACKs the session. Old bearer invalidation is atomic with activation; unexpected errors retain a bounded recovery path without weakening authentication. Reset invalidates v2 credentials and outstanding sessions, and requires physical enrollment before new ownership.

Use a dedicated backend authorization helper for legacy/v2 token verification, with constant-time verifier comparison, strict device-ID binding, explicit revocation, and no raw token logging. Update all physical-device endpoints to use it before activating hash-only v2 credentials. Do not change `authenticatePhysicalDevice` alone while other routes still compare `devices.device_token` directly.

## Version isolation and compatibility

| State | Firmware | Server behavior |
| --- | --- | --- |
| Legacy pilot device, not migrated | v1 | Existing `/pair/start` and `/pair/status` continue temporarily; document exposure and limit access to the small pilot. |
| Enrolled but not activated | v2-capable | v2 attempts use v2 endpoints; explicit supervised recovery if activation fails. Do not silently downgrade to v1 on v2 auth failure. |
| v2 activated | v2 | Old `/pair/status` **must not** disclose or mint any credential, and old `/pair/start` must not create sessions for this device. Block this both in the routes and at the `device_pair_status` / `ensure_device_token` function boundary so direct service-role callers cannot accidentally recreate a legacy bearer. |
| Factory reset / lost token | v2 | Require authenticated physical re-enrollment/recovery; do not recover from a public ID alone. |
| Fully migrated fleet | v2 | Remove legacy credential-return path, revoke previously exposed tokens, and retire v1 pairing. |

**Important:** An API-side denylist or superficial `paired: false` response is not sufficient if `ensure_device_token` can still mint a token or if any other route provides the same credential. All legacy credential issuance paths must be inventoried before cutover.

## Implementation slices (small independently testable PRs)

1. **Contract and dependency audit (this PR):** record actual code and RPC behavior, the physical-authentication constraint, failure states, compatibility rule, and release gate. No endpoint, firmware, DB, or deployment changes.
2. **TLS and device identity foundation:** enable certificate/hostname validation, tests for trusted time/certificate changes and connection failure, and a trustworthy physical/factory enrollment method. Keep legacy behavior unchanged for existing pilot devices.
3. **Additive server schema and v2 endpoints behind a disabled feature flag:** session binding, proof validation, bounded delivery/ACK, replay handling, rate limiting, transactional claim/reset, and explicit v2-vs-legacy isolation. Work against a disposable database; review migrations separately from the inconsistent production migration ledger.
4. **Firmware v2 flow:** on-screen code, authenticated start/poll, persisted bootstrap and active credentials, idempotent ACK, power-loss recovery, and a clear supervised re-enrollment state. Preserve regular config and scheduled low-power behavior.
5. **Controlled physical pilot migration:** verify a real frame, old token-loss recovery, new flow, sharing, reset, Wi-Fi preservation, and failure/retry scenarios. Rotate each migrated token and block its legacy routes/functions. Track remaining v1 units without exposing credentials in logs.
6. **Final cutover:** inventory all legacy issuers, rotate remaining potentially exposed tokens through physical re-enrollment, disable v1 status/start, remove legacy credential storage/issuer once all consumers use v2, then run two-user negative authorization tests and acceptance tests.

No `db push`, `db reset`, production migration-history repair, or bulk credential rotation is part of this design PR.

## Required regression / adversarial tests

- A public request with another device ID never obtains or creates a reusable secret and cannot generate a v2 claim session.
- A forged v2 session/code for an existing device does not claim it or reach token delivery.
- An app user who guesses a code cannot pair after expiry, lockout, prior claim, or a mismatch to the active session. Two simultaneous claims produce exactly one winner.
- Token delivery fails for the wrong device, wrong session secret, revoked credential, expired session, and replay after ACK; idempotent delivery works for a lost response before ACK.
- Old status/start cannot return **or mint** a token for a v2 device. Any v2 auth error fails closed rather than falling back to legacy.
- User A cannot read, write, reset, claim, or share User B's devices, reminders, events, settings, or token/session records. Server-role routes must enforce authorization before data access.
- Physical device: initial enrollment, pairing, power loss at each stage, manual update, normal/power-save mode, token loss, Wi-Fi persistence, owner reset, owner/member sharing, and re-pairing all work.
- Certificate validation rejects an untrusted or wrong-host certificate; certificate rotation has an operational update strategy. Confirm credentials never appear in URL, HTTP/error logs, serial logs, or response payloads to the app.

## Rollout gate and rollback

Do not expand beyond the supervised pilot while either legacy endpoint can expose credentials or untrusted ID-only first claims remain possible. A successful unit test and a green Vercel deployment do not override this gate.

Safe release order: reviewed additive DB changes -> dormant API -> firmware physical enrollment -> supervised pilot -> per-device v2-only enforcement / credential rotation -> disable legacy endpoints -> fleet-wide negative tests. Preserve backups and forward-only migration discipline as in `docs/security-rollback-playbook.md`.

Rollback of an app/firmware regression must not re-enable public token return for already-migrated v2 devices. Repair forward or put those devices into physical recovery.
