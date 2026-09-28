# Staging real-session negative-write acceptance (2026-09-28)

**Only** separate Vercel project `prj_H8CovSaYkhbYg8CCvpl4N2hjsFaR` and Supabase project `ouwhfzjaahdipwmelzvf`. No production changes, app data migrations, firmware flashing, or secret exports.

## Purpose and safety

The existing seven GET checks passed 7/7 under each synthetic user. This second page tests the actual write APIs with real user access tokens, never passwords shared in chat.

Two additional, explicitly disposable staging virtual devices were inserted and verified. Each has an authenticated owner, a matching owner membership, `device_settings.settings_json.staging_disposable_security_fixture`, a temporary reminder, and **no device token or token hash**:

- Tester A: `frm_FAEE00000001` — `SECURITY TEST A - disposable`.
- Tester B: `frm_FBEE00000002` — `SECURITY TEST B - disposable`.

These are **not** the original A/B virtual frames `frm_FA0000000001` and `frm_FB0000000002`, which contain user-created staging data. Do not test deletion against originals. The disposable frames may temporarily appear as an extra frame in the UI; remove them after both tester checks and post-test database verification. Never call legacy `pair/status` against fixtures: it can mint credentials.

The page is server-gated to both exact project IDs, then the browser preflights signed-in identity, session, own disposable owner membership, fixture marker, and lack of other-device membership. Each write request uses the real Supabase user JWT in an Authorization header, never a URL. A mismatched response stops the sequence immediately.

## Expected cross-user and missing-token responses

| Negative POST check | Expected |
| --- | --- |
| Save settings with no bearer | 401 `missing_auth_token` |
| Delete with no bearer | 401 `missing_auth_token` |
| A/B save other disposable settings | 403 `forbidden` |
| A/B rename other disposable frame | 403 `frame_owner_required` |
| A/B request other disposable frame revision | 403 `forbidden` |
| A/B heartbeat other disposable frame | 403 `forbidden` |
| A/B delete/reset other disposable frame | 404 `frame_not_found` |

The last operation is potentially destructive **if authorization is broken**, which is why it targets only disposable frames, runs last, and immediately stops on failure.

## Acceptance

1. Deploy the page to staging only after CI passes. Test as A and B at `/staging/security-check/writes`; screenshot results without passwords/tokens.
2. Confirm all 14 expected statuses across both users, with no unexpected response.
3. Query staging directly to confirm both disposable devices retain their original names, owner memberships, settings markers, original reminders, null device credentials, and no unauthorised revision or activity changes. Do not claim unchanged state from HTTP statuses alone.
4. Only after acceptance, remove exact disposable fixture rows (and any dependent entries) from staging, taking care not to delete the original two virtual frames or user-generated data. Keep the original read-only checker and audit trail.

This does not clear unauthenticated legacy pairing/status routes or constitute full system penetration testing.
