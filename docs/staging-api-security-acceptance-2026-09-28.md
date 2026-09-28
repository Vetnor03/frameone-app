# RE:MIND staging: API security acceptance (2026-09-28)

Status: **read-only review; no production or staging runtime change in this branch**. Base branch `development`; keep the current staging deployment, tester accounts, and virtual frames unchanged while the user checks the UI. Supabase project `ouwhfzjaahdipwmelzvf` is **staging only**. The live Vercel project and Supabase project must not be modified by this work.

## Evidence already obtained

- Real staging user accounts `tester-a@re-mind.test` and `tester-b@re-mind.test`, each with a separate virtual device, membership, settings, and one reminder.
- Read-only queries impersonating each `authenticated` JWT subject show only that account's device, membership, settings and reminder.
- In separate rolled-back transactions, attempts by A to update B's reminder/settings, and B to update A's, each affected zero rows. A final read check showed both fixtures unchanged. **These are DB/RLS tests only; they do not establish real HTTP authorization.**
- The browser smoke test for A/B and actual signed-in API calls are pending user confirmation. Do not remove fixtures until that confirmation.

## Route inventory and concrete findings

| Route | Observed behavior | Acceptance implication |
|---|---|---|
| `GET /api/device/pair/status` | Accepts just a `device_id`. With service role calls `device_pair_status` and returns its row. Staging SQL function returns `paired, device_token` and calls `ensure_device_token`, which creates a token when absent. | **Release blocker:** bare device ID can obtain/mint a reusable device bearer for a paired device. Do not test by requesting fixture IDs: it would create token material. |
| `GET /api/device/pair/start` | Calls `start_pairing(p_device_id)` with service role, no device proof. DB rejects existing owned/member devices, but unauthenticated callers can start an unowned device ID. | **Release blocker:** first-pair identity must be proven physically, not inferred from ID. |
| `GET /api/device/frame-config` | Paired path calls `authenticatePhysicalDevice`; unowned path invokes `start_pairing` without device proof. | Paired config is protected, but unpaired path remains part of legacy pairing attack surface. |
| `GET /api/device/status` | Fetches device telemetry by device ID via service role without caller auth. | **Release blocker:** device telemetry is readable by ID. |
| `POST /api/device/status` | Upserts hardware telemetry by device ID via service role without caller auth. | **Release blocker:** caller can spoof status/render/charging signals. |
| `GET /api/device/user-frames` | Checks signed-in Supabase session and queries device membership with caller's token. | Verify A/B over real HTTP, including unauthenticated response. |
| `POST /api/device/save-settings` | Verifies Supabase bearer with `auth.getUser`, then checks membership before service-role update. | Test A/B requests against wrong virtual device and valid own device. |
| `POST /api/frame/rename` | Authenticates caller and invokes `rename_owned_frame` with caller JWT, not service role. | Test owner vs foreign user over real HTTP. |
| `POST /api/frame/delete` | Verifies user and membership before privileged reset, distinguishing owner/member. | Test *negative paths without deleting fixtures*. Reserve successful delete test for a separate disposable fixture. |

This inventory is not exhaustive. Remaining device, content and integration routes still require review.

## Compatibility and ordering

Firmware `BackendApi::pairStatus` polls the unauthenticated status route. `ensurePairedNoReboot` uses it both to recover a lost token and to receive the token after code claim. **Do not simply remove /pair/status or issue a new token by bare ID as a replacement.** A new authenticated device-enrollment and polling flow must be deployed with firmware; see `docs/pairing-v2-security-design.md`.

The existing app also calls `GET /api/device/status` without a bearer in places, and firmware reports via `POST`. Tightening this route requires coordinated client/firmware changes, not an isolated server edit. Do not merge an untested auth change that makes the app appear broken.

## Next small slices

1. User checks A and B onboarding/app display in staging. If it fails, diagnose before modifying this baseline. Preserve production untouched.
2. Add read-only API tests from two real authenticated staging sessions: own device vs cross-device, as well as no-session requests. Do not expose passwords/tokens in GitHub, chat, URL, or logs. Vercel staging access protection stays on. Test GET and negative POST paths first; record exact status codes and assert no cross-user data.
3. Implement device status route authentication in a dedicated feature branch along with app caller changes and firmware-compatible credentials. Exercise fixtures and an isolated firmware test path; no real hardware until explicitly authorized.
4. Build pairing v2 behind an opt-in rollout gate: TLS-validated physical identity, authenticated start/poll, session-bound code/secret, token delivery/ACK and no legacy fallback for v2. Add schema only in a reviewed forward migration on disposable/staging DB. No reset, bulk token rotation or production migration replay.
5. Deploy and verify each feature in staging, then prepare a reviewed PR to `main` only after the browser, API and physical pilot tests pass.

**Release gate:** the paired-token disclosure and ID-only enrollment paths must be gone or restricted behind completed physical v2 migration before scaling beyond the supervised pilot. Database RLS passing does not clear these API risks.

**Rollback:** this audit branch is additive documentation only. Deleting the audit branch reverts all its changes. The current staging deployment and two synthetic users/virtual frames are left in place, and live `main` is untouched.
