# Pairing v2 — bounded encrypted delivery and ACK (staging, 2026-09-28)

**Scope:** dormant, service-only token delivery and acknowledgement. All existing and new v2 HTTP start/claim/status/deliver/ack endpoints remain hard-disabled. No physical or virtual frame is provisioned or migrated by this slice. Only the separately pinned staging Supabase project may receive the reviewed private RPCs.

## Credential and encryption boundary

After a session has been claimed, the frame must prove BOTH a supervised, unique bootstrap secret and an independent 256-bit session polling secret. The private delivery verifier lookup requires the exact device/session/generation; Node checks bootstrap SHA-256 with constant-time comparison. The atomic SQL delivery operation then rechecks the verifier, generation, exact polling-secret hash, owner membership, session state, revocation and expiry while holding the canonical device/credential/session locks. It never accepts just a device ID, short code or signed-in app user.

The server generates a fresh random 256-bit device token. A separate, server-only 256-bit AES-GCM key encrypts the 32-byte token using a fresh 96-bit nonce, a versioned envelope and authenticated associated data binding **device ID + session ID + credential generation**. The private database receives the ciphertext envelope and SHA-256 token verifier; it never receives token plaintext or the encryption key. The future HTTP delivery route will return token plaintext only to the authenticated physical frame over certificate/hostname-validated TLS. The app never receives it.

Delivery is bounded to the earlier of session expiry or **three minutes**, and three total attempts (first delivery + two identical retries). A lost HTTP response is retried using the **same encrypted token**, not a newly generated candidate. Node authenticates/decrypts the stored ciphertext and verifies the resulting token against the persisted hash before returning it. Wrong key, tampered tag, altered context or malformed DB result fail closed. After the retry budget or expiry, recovery must be a separately supervised physical operation; do not silently fall back to legacy token retrieval.

## ACK and isolation

The frame first persists the delivered token locally, then proves possession of that exact token **and** both bootstrap/polling secrets. The ACK RPC atomically copies the token hash into the private active credential, marks the frame paired, revokes bootstrap reuse and changes the exact session to `acknowledged`. In the same transaction, it deletes the temporary token hash and encrypted payload. A repeated ACK using the same proofs/token may return only `already_acknowledged`—never the bearer or ciphertext. Legacy `devices.device_token` remains NULL.

**Important release blocker:** existing physical authentication and some legacy token-issuer functions still use the old credential model. The ACK logic stays inaccessible from HTTP until *every* physical API path supports hash-only v2 device tokens and legacy token-return/minting is forbidden for activated v2 devices at the function boundary. Do not activate any real device now. The working production frame continues unchanged.

## Test/rollout contract

1. Pass CI stable tests, typecheck and changed-file lint. Apply only `supabase/staging/pairing_v2_delivery_ack_20260928.sql` through a reviewed, explicitly targeted migration to project `ouwhfzjaahdipwmelzvf`; never `db push` or replay production migration history.
2. Catalog-verify all three SECURITY DEFINER RPCs grant EXECUTE **only** to service role and that the private tables continue to deny anon/authenticated/service Data API grants.
3. Within one rolled-back staging transaction, create a disposable synthetic frame and verifier, start/claim its session using existing service-only RPCs, deliver **fake test-only ciphertext** and a random token hash, verify identical retry, attempt budget, wrong proof/hash rejections, valid ACK, ciphertext scrubbing, bootstrap revocation, active hash, and ACK replay result. Do not print raw credentials, ciphertext, or private hashes.
4. Query again after rollback: zero private credentials/sessions/claim buckets and zero disposable frames, both original test frames and their users preserved. These SQL tests do **not** test AES-GCM; separate Node crypto unit tests cover encryption/AAD/tamper.
5. Before enabling any HTTP route: physical supervised provisioning, independent secret/key management and rotation, protected staging device ingress, verified user JWT, source rate limits, all physical routes accepting hash-only v2 credentials, DB-level v1 issuer guards and an actual ESP32 frame positive test are mandatory.

## Verified staging acceptance

Merged [PR #1329](https://github.com/Vetnor03/frameone-app/pull/1329) into `development` after **987/987 stable tests**, typecheck, and changed-file lint passed. The separate full test/lint audit still reports previously documented debt. The private SQL was applied only to project `ouwhfzjaahdipwmelzvf` as migration `20260928205305_staging_pairing_v2_delivery_ack_20260928`.

Catalog verification confirmed all three new SECURITY DEFINER functions are executable by `service_role` only, not `anon` or `authenticated`.

One rolled-back staging SQL transaction used two synthetic devices and only ephemeral dummy token hashes/envelopes. It verified unknown/wrong polling and bootstrap proofs reject before delivery; first delivery succeeds; two retries preserve the first ciphertext and token hash even when later candidates differ; the fourth attempt is denied; wrong ACK is rejected; correct ACK atomically stores only an active hash, marks the session acknowledged, revokes bootstrap and scrubs temporary ciphertext; repeated ACK returns only `already_acknowledged`; post-ACK delivery is rejected; and expired ciphertext is erased and cannot be acknowledged.

Separate Node tests cover actual AES-GCM encryption/decryption, authenticated associated-data binding, wrong-key and tampered-ciphertext failure; the SQL fixture uses deliberately synthetic envelope bytes, not a deployed encryption key.

A fresh post-rollback query confirmed **zero** v2 credentials, sessions, throttling records and disposable frames/memberships. Both original virtual frames, their memberships and tester accounts remain intact. All five v2 HTTP endpoints are still disabled.

**This is not physical acceptance.** No real credentials were issued, a real frame has not connected to staging, and hash-only v2 authorization across the rest of the physical API plus legacy issuer guards must be completed **before enabling delivery/ACK for hardware**.

**Rollback:** the dormant Next.js modules may be reverted from `development` without affecting production. Applied private service-only functions are inert while no credentials exist; retire them through a separate staging-only reviewed migration rather than destructive automatic rollback.

**Production:** `main`, production Supabase, physical firmware and the currently working frame are out of scope.
