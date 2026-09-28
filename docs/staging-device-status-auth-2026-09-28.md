# Device-status authentication — staging rollout check

**Scope:** Next.js status API and staging checkers only. Firmware's existing `postDeviceStatus` already uses `NetClient::httpPostAuthJson(url, DeviceIdentity::getToken(), ...)`; the server now verifies that bearer. No new firmware binary, Supabase schema change, Vercel environment change, or production merge in this PR.

## Contract

- `GET /api/device/status?device_id=...`: requires a verified Supabase user identity from a valid Authorization bearer **or** the existing Supabase SSR session cookie, plus membership for that exact device. Missing/invalid 401, nonmember 403. An explicit Authorization header takes precedence and cannot fall back to the cookie if invalid. The service-role read runs **only after** membership validation. Response shape unchanged and cache set to private/no-store.
- `POST /api/device/status`: requires a device bearer **for the exact ID in the body**. A browser/user bearer, missing bearer or another device's bearer returns 401 without any upsert. The physical firmware already sends its token; current telemetry and `did_render` semantics remain unchanged. No bearer is logged, echoed or accepted in query parameters.
- The existing browser status GETs stay unchanged: Supabase's SSR cookie is verified server-side with `getUser`, followed by exact device membership. An explicit Authorization header takes precedence and is never allowed to fall back to cookies after failure. Neither caller uses a device ID as proof.

## Acceptance before production release

1. CI stable tests, changed lint and typecheck pass. Run the updated staging read-only checker as both Tester A and B: **10/10 per user** including own telemetry GET 200, foreign GET 403, invalid bearer GET 401 even with a signed-in cookie. The status page in staging may show virtual devices without telemetry, which is expected.
2. Run the updated staging negative-write checker as both Tester A and B: **8/8 per user**, including a user JWT POSTing fake battery status to the other disposable frame (expected 401). After both runs, verify in the staging database that the two disposable fixtures are unchanged. Then separately test `POST` against a staging-only device with a valid **physical** device credential; confirm missing, wrong and user JWT cannot write while the legitimate credential can. This valid-device case cannot be verified by virtual-frame UI alone. Do **not** call the legacy pairing-status endpoint to obtain a credential, as it can mint/return a bearer.
3. Build and flash a staging-targeted pilot firmware **only when physical staging provisioning and test credentials are ready**. Verify battery, charging, wake/heartbeat and `did_render` behavior. Existing production frame is not the staging test device.
4. Only then review promotion to `main`. Legacy pair/status and pair/start vulnerabilities are still release blockers; this PR does not fix them.

## Staging acceptance result (2026-09-28)

The user ran both real-session checkers as Tester A and Tester B on the deployed staging app. **20/20 read-only and 16/16 negative-write checks passed (36/36 total)**, including protected telemetry GET (own 200, foreign 403, invalid explicit bearer 401) and rejected user-token status POST (401). These are observed browser results, not a physical-device positive credential test.

The two distinct disposable security-test frames were then verified directly in staging: original owners, names, membership roles, settings markers and one reminder each remained; neither held a physical credential or unauthorized settings key. No unexpected status, update-state, update-request or onboarding records existed. In a guarded staging-only transaction, their reminder, settings, membership, content-revision records and devices were deleted. A follow-up query confirmed zero remaining disposable device/membership/settings/reminder/revision/history rows; both original virtual frames, both original memberships and both tester accounts still exist.

**The negative-write checker cannot be rerun until new disposable fixtures are intentionally provisioned.** It fails closed on missing or altered fixtures. A valid physical-device status POST, real physical-frame staging enrollment and pairing-v2 security remain outstanding.

## Rollback

Revert this app/API commit on `development` to restore prior staging status behavior. No DB migration or firmware rollback needed. Do not revert production/activate another device's credential. This contract does not make insecure legacy pairing acceptable.
