# RE:MIND × Homey — pilot foundation (read-only)

**Status:** Under Evaluation, not connectable. This branch does not contain a working Homey account link, live data sync or frame renderer. Do not advertise Homey as connected or production-ready.

Official API: https://api.developer.homey.app/
OAuth/HTTP spec: https://api.developer.homey.app/http-and-socket.io/http-specification

## Verified technical route

1. Register RE:MIND as a Homey Web API client to obtain Client ID and Secret, and register the exact callback URL. New clients are limited to 100 Homey Pro users; access to Homey Cloud needs a limit increase/approval.
2. Use the documented Homey OAuth2 authorization code flow. `homey/oauth.mjs` prepares authorization and token exchange/refresh requests. It does not send requests and does not log any secrets.
3. On callback, verify encrypted state, a one-time browser nonce and short expiry, plus the authenticated RE:MIND account. Never exchange a code without the validated browser binding. Store tokens encrypted in existing `user_integrations` using `INTEGRATION_CREDENTIALS_KEY`.
4. Obtain the user's Homeys using `GET https://api.athom.com/user/me`. Let the user select their intended Homey. For Homey Pro request delegation token, establish a session on its remote URL, and request only read-only device capabilities (`devices.readonly`).
5. Do not trust or persist a Homey remote URL as authoritative: the Homey API notes it can change. Only use a freshly returned validated HTTPS Homey host, not an arbitrary client-supplied URL (SSRF prevention).
6. Let the user explicitly select devices/sensors to display. The `homey/model.mjs` helper filters full device objects to a small, bounded, typed subset of values. Do not store raw Homey metadata or send credentials to devices.
7. Poll into a scoped RE:MIND cache with a moderate TTL (first pilot target: 5–15 min), not direct Homey calls per frame. Render only selected values, using existing frame wake/power-save rules. Avoid creating a reminder or a physical wake on every changing sensor reading.
8. Disconnect must revoke/delete stored RE:MIND credentials and cached readings; user can separately revoke access from Homey.

## Security and product decisions

- First release: **read-only**: temperature, humidity, CO₂, electricity/energy, door/contact state, and power state. No device commands, no Flow triggers, no write scopes.
- **Account authorization is separate from frame selection**: new frames must explicitly opt in to show sensors.
- Never display or persist another user's readings. No raw Homey data in analytics logs.
- No changes to existing Supabase schema, live credentials, frame firmware or currently connected integrations in this foundation PR.
- Use existing integration credential encryption and status cache patterns for the eventual implementation. Confirm rate limits before enabling larger-scale syncing.

## Remaining dependencies before enabling Connect

- Confirm Imran's Homey type: Pro (generation), Pro mini, or Cloud; clarify which specific values he wants displayed.
- Register a Web API client; configure server-side `HOMEY_CLIENT_ID`, `HOMEY_CLIENT_SECRET`, and a vetted redirect URI. Confirm granted scopes and Cloud approval if needed.
- Implement state+cookie OAuth routes, token refresh and Homey/device chooser; secure scheduled sync, per-user cache, opt-in frame configuration, disconnect, status, and rendering. Regression-test against a real consenting Homey account.
- Only after those checks move catalogue status to Experimental/Connectable.

This is deliberately a safe foundation for the pilot, **not a finished integration**.
