# Pairing v2 — atomic claim and state-only polling (staging, 2026-09-28)

**Scope:** privately implemented and tested claim + poll code. `/api/device/pair/v2/start`, `/claim` and `/status` all remain **disabled**. No physical device, app-user frame, production firmware or existing credential is changed by this slice.

## Claim trust boundaries

A verified signed-in account will eventually submit the four-character display code through a future protected POST. The code is normalized and converted to the **same server-HMAC digest** used at session start; the code, HMAC key and trusted network source are never stored in SQL. Caller identity **must come from a verified Supabase session**, not an arbitrary user ID in JSON. A separate server-only HMAC key derives account and trusted-network rate buckets; never trust a client-controlled `x-forwarded-for` value as identity. HTTP request parsing, these keys and trusted ingress are **not enabled here**.

The service-role-only `pair_v2_staging_claim` RPC counts *every* guess (including nonexistent codes), atomically limits one account to **5 per 10 minutes** and one network bucket to **30 per 10 minutes**, and then resolves a live unclaimed MAC. It locks the canonical device and credential rows before locking and revalidating the session, using the same lock order as session start. It rejects expired/already claimed/cancelled sessions, owner/member conflicts, revoked bootstrap credentials and changed generations. One transaction updates `devices.owner_user_id`, inserts owner membership and marks that exact session claimed. A losing concurrent request cannot also claim it. It does **not** mint, store or return any physical-device token.

A successful claim sets ownership while `paired_at` remains unset until the later authenticated token-delivery/ACK step. The app must eventually display a waiting-for-frame state rather than treat claim as completed provisioning.

The rate-limit table lives in the private non-exposed schema, with RLS and no public/app/service table grants. Retention cleanup of old rate windows must be implemented before enabling the HTTP route. Account/network limits are baseline controls—not a substitute for external abuse protection if large-scale account creation or distributed guessing is possible.

## Device-only state poll

`pair_v2_staging_poll_verifier` returns the current hash and generation only for the exact device/session to the service role. The server checks the physically provisioned 256-bit bootstrap proof with constant-time comparison. The database poll then checks session ID, device ID, credential generation, hash of the **separate** session-only 256-bit polling secret, expiry, revocation, legacy-token absence, and pending/claimed owner consistency.

The only possible successful state responses are `pending`, `claimed`, and `expired`. On expiry, the exact session becomes terminal and any eventual temporary delivery material is cleared. A poll **never returns a token, user ID, display code, settings or device configuration**. Delivery and ACK are later separately reviewed operations.

Every RPC is SECURITY DEFINER with an empty fixed search path. PostgreSQL PUBLIC EXECUTE is revoked and only `service_role` can call it. No blanket private table/Data API grant is added. The HTTP handlers for `/claim` and `/status` return 503 on the pinned staging project and 404 elsewhere, do not parse requests, and cannot create database clients.

## Staging acceptance and rollback

1. CI stable tests, typecheck and changed-file lint must pass. Apply only the reviewed `supabase/staging/pairing_v2_claim_poll_20260928.sql` to Supabase project `ouwhfzjaahdipwmelzvf` with a targeted migration; never `db push` or replay production migrations.
2. Confirm the three RPCs are service-only and the private claim-attempt table has RLS with no API grants. Test the *actual database* inside a single rollback transaction with a synthetic, unowned, deliberately disposable frame and one existing staging tester account. Verify invalid code, valid claim, second claim rejection, expired state, wrong polling hash, and count throttles; never print secret material.
3. Confirm all synthetic rows are absent after rollback, both original virtual frames and tester accounts remain, and no v2 session/credential has been persisted.
4. Before enabling anything: implement trusted physical provisioning + TLS and protected staging ingress; source validation, rate-limit expiry cleanup, keys, secure user JWT verification, authenticated start, claim/poll HTTP wiring, and the bounded encrypted delivery/ACK path. Enforce v2-only credential checks across every physical endpoint. A user-code claim by itself is **not** frame authentication.

## Verified staging result

Merged [PR #1328](https://github.com/Vetnor03/frameone-app/pull/1328) into `development`; CI passed **977/977 stable tests**, typecheck and changed-file lint. The separate full audit continues to report known pre-existing debt.

The reviewed additive SQL was applied to **only** staging Supabase project `ouwhfzjaahdipwmelzvf` as migration `20260928204011_staging_pairing_v2_claim_poll_20260928`. All three new SECURITY DEFINER RPCs are executable by `service_role` only, not by `anon` or `authenticated`. The new claim-attempt table and the prior two v2 tables have RLS enabled, zero policies and no Data API role DML grants. The RLS-no-policy INFO advisory is intentional for this private deny-all design; the existing 21 signed-in SECURITY DEFINER warnings in other public functions are still a separate audit.

A single **rolled-back staging transaction** exercised actual database calls with two synthetic devices and ephemeral verifiers: unknown code rejected; correct code atomically set owner, owner membership and claimed session without setting a device token; replay rejected; correct dual-proof poll reported pending before claim and claimed after claim; wrong bootstrap and polling verifier rejected; expired session was closed; account quota denied attempt six and network quota denied attempt 31. No real frame/session credentials or HMAC keys were created.

A separate post-test query confirmed **zero** v2 credentials, sessions and throttle records, **zero** synthetic devices/memberships, and both original tester frames and accounts intact.

**Still pending:** real JWT/ingress wiring, physical provisioning, trusted network-source derivation, server-side HMAC keys, abuse monitoring, retention cleanup, authenticated device start/poll HTTP, encrypted token delivery and ACK, v2-only auth across all physical API routes, physical firmware migration. Claim/poll HTTP endpoints remain hard-disabled; do not expose them to testers yet.

**Rollback:** remove dormant code through a separate reversible `development` PR. Already-applied service-role-only RPCs and the private empty rate table are inert until a separately reviewed staging-only retirement. No automated destructive schema rollback and no production/firmware change.
