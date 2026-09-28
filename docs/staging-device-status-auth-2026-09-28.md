# Device-status authentication — staging rollout check

**Scope:** Next.js status API and browser caller only. Firmware's existing `postDeviceStatus` already uses `NetClient::httpPostAuthJson(url, DeviceIdentity::getToken(), ...)`; the server now verifies that bearer. No new firmware binary, Supabase schema change, Vercel environment change, or production merge in this PR.

## Contract

- `GET /api/device/status?device_id=...`: requires a verified Supabase user JWT in the `Authorization: Bearer` header and membership for that exact device. Missing/invalid 401, nonmember 403. The service-role read runs **only after** membership validation. Response shape unchanged and cache set to private/no-store.
- `POST /api/device/status`: requires a device bearer **for the exact ID in the body**. A browser/user bearer, missing bearer or another device's bearer returns 401 without any upsert. The physical firmware already sends its token; current telemetry and `did_render` semantics remain unchanged. No bearer is logged, echoed or accepted in query parameters.
- Both HomePageClient status fetch sites now forward the active Supabase session's access token. The batch fallback reads the session once per batch, and missing session fails soft rather than requesting private telemetry anonymously.

## Acceptance before production release

1. CI stable tests, changed lint and typecheck pass. Run the updated staging read-only checker as both Tester A and B: **10/10 per user** including own telemetry GET 200, foreign GET 403, anonymous GET 401. The status page in staging may show virtual devices without telemetry, which is expected.
2. Run the updated staging negative-write checker as both Tester A and B: **8/8 per user**, including a user JWT POSTing fake battery status to the other disposable frame (expected 401). After both runs, verify in the staging database that the two disposable fixtures are unchanged. Then separately test `POST` against a staging-only device with a valid **physical** device credential; confirm missing, wrong and user JWT cannot write while the legitimate credential can. This valid-device case cannot be verified by virtual-frame UI alone. Do **not** call the legacy pairing-status endpoint to obtain a credential, as it can mint/return a bearer.
3. Build and flash a staging-targeted pilot firmware **only when physical staging provisioning and test credentials are ready**. Verify battery, charging, wake/heartbeat and `did_render` behavior. Existing production frame is not the staging test device.
4. Only then review promotion to `main`. Legacy pair/status and pair/start vulnerabilities are still release blockers; this PR does not fix them.

## Rollback

Revert this app/API commit on `development` to restore prior staging status behavior. No DB migration or firmware rollback needed. Do not revert production/activate another device's credential. This contract does not make insecure legacy pairing acceptable.
