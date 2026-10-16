# RE:MIND MQTT — universal frame firmware and fleet rollout

## Important

The standard `alfred_v1_2` firmware on `main` is **device-agnostic** and
includes MQTT support without a separate build flag. It does
NOT embed any frame ID, MQTT password, broker API key or customer credentials.
It uses the same familiar AP → Wi-Fi → pairing → app flow. Every frame uses its
own existing RE:MIND token to fetch its MQTT credentials from an authenticated
no-store HTTPS endpoint, after it is paired.

The broker hostname/port and optional public trusted root CA now come from
our authenticated RE:MIND backend. Future hostname or root CA changes can be
provisioned centrally without reflashing devices. The backend verifies the
HTTPS connection before the frame uses this public trust anchor; the MQTT
transport independently checks the broker hostname and certificate chain. One firmware
build can support many frames. The 2026 prototype EMQX broker and public
DigiCert Global Root G2 certificate remain the compatibility defaults.

**Do not ship commercially until actual physical MQTT testing,
reliable automatic provisioning, lifecycle deprovisioning and power/latency
measurements have been completed.** The standard Alfred binary contains MQTT,
but backend rollout gates stay off for unapproved fleets; HTTPS always remains
the fallback. The separate legacy ESP32 hardware profile is unchanged.

## Backend switches

- `MQTT_PILOT_ENABLED=true`: master experimental MQTT switch, already
  configured for the first frame.
- `MQTT_PILOT_DEVICE_ID` and `MQTT_PILOT_FRAME_PASSWORD`: preserve the
  first manually provisioned frame; these are never reused for other frames.
- `MQTT_FLEET_ENABLED=true`: opt in to *all paired frames* only after broker
  account provisioning and permissions have been validated. Otherwise leave
  this UNSET/false. The app automatically detects server eligibility; customers
  never need a new UI toggle.
- `MQTT_FLEET_DERIVATION_SECRET`: **already generated** as a cryptographically
  random sensitive Production variable in Vercel. Keep it backed up securely. Do NOT use the EMQX API secret,
  the prototype's MQTT password, a public device token, or a human-memorable
  password. Keep this stable across redeployments. Changing it requires a
  controlled device credential rotation at the broker.
- `MQTT_FLEET_PROVIDER=emqx_dedicated_v5`: select a compatible management
  API. Serverless is not supported for automatic account creation.
- `MQTT_FLEET_MANAGEMENT_URL`: HTTPS Dedicated management endpoint ending
  in `/api/v5` (not the existing Serverless publish URL).
- `MQTT_FLEET_API_KEY` and `MQTT_FLEET_API_SECRET`: server-only Dedicated
  management API credentials; never reveal to the client.
- `MQTT_BROKER_HOST`, `MQTT_BROKER_PORT`: backend-only broker location,
  validated before delivery. Defaults to the current test broker and 8883.
- `MQTT_BROKER_ROOT_CA_PEM`: optional **public** broker root certificate
  delivered over device-authenticated HTTPS, allowing secure CA migration
  without another frame flash; if absent, firmware uses its bundled public
  DigiCert Global Root G2.
- Existing `MQTT_PILOT_EMQX_API_KEY`, `_API_SECRET`, and
  `_PUBLISH_URL` stay server-side only.

When enabled, the backend derives a different MQTT password for each frame
with HMAC-SHA256 and the dedicated secret, and uses the frame's existing device ID as its MQTT username, so the
universal firmware needs no changes. It preserves the prototype's manually
created account through the separate pilot credentials path. A pre-existing
fleet account is never modified unless its ACL already matches this frame.
The backend checks or creates the broker's password-auth account, confirms
non-superuser status, and verifies exactly one subscribe-only
ACL for `remind/pilot/revisions/{device_id}`. It also demands a global
deny-all ACL rule for other topics; an unexpected or permissive policy blocks
credential issuance. It refuses unexpected identities, superusers and wider
ACLs. After authenticated
onboarding it returns that frame's own MQTT username/password and broker
address over HTTPS. All MQTT messages remain hints that must be verified
against the durable RE:MIND display revision; the broker cannot command
untrusted display content.

## Current EMQX Serverless blocker (confirmed from provider docs)

The existing EMQX Serverless broker supports the manually configured first
prototype. **Its documented Broker Deployment API does not provide the
authentication-user/ACL management methods needed to onboard future frames
automatically.** The full EMQX v5 API is documented for Dedicated deployments,
not Serverless. Serverless external HTTP auth is also unavailable. We therefore
**refuse** Serverless for fleet provisioning rather than trying undocumented
management writes.

For automatic production-scale onboarding, obtain a provider/tier with
authenticated user and ACL administration (such as EMQX Dedicated Flex), or
set up an alternative compatible broker. Do NOT purchase a paid tier or
activate `MQTT_FLEET_ENABLED` before costs, management API access and a
two-frame isolation test are approved. The current prototype and manual HTTPS
fallback remain operational in the meantime. A new MQTT-enabled firmware
flash is NOT required just for later account provisioning and backend broker
changes.

Serverless has a 1,000 concurrent connection limit and account/ACL quotas;
check pricing and scale before pilot expansion.

## Security & lifecycle work before selling

- Deprovision MQTT account/ACL when a device is revoked, resold, or factory
  reset; do not allow stale credentials indefinite access.
- Rotate credentials on token compromise and after master-key changes, in a
  coordinated sequence that doesn't strand offline frames.
- Restrict API credentials to server functions; handle API 429/5xx with
  bounded retries/backoff and cache completed provisioning status so devices
  do not hit the broker management API on every routine reconnect.
- Verify first frame connects and receives updates; verify second frame has
  its OWN credentials and cannot subscribe to the first frame's topics;
  measure 4+ hours of real whole-board current with app open/closed.
- Preserve `WIFI_PS_MAX_MODEM` idle, `WIFI_PS_MIN_MODEM` when app active,
  and existing HTTPS fallback and display ACK. Verify actual ALS support in
  flashed SDK; compiling a build does NOT prove automatic light sleep works.

Do not force OTA or wipe NVS. A normal single-app firmware flash should
preserve pairing, but confirm hardware flash layout / partition before
applying any binary to a production unit.


## Broker isolation — 16 October 2026

Fleet must never reuse the original pilot's Serverless publish credentials,
publish endpoint, or MQTT connection hostname. For Dedicated fleets set:
`MQTT_FLEET_BROKER_HOST`, `MQTT_FLEET_BROKER_PORT` (MQTT/TLS endpoint),
`MQTT_FLEET_BROKER_ROOT_CA_PEM` (if the trust root differs),
and `MQTT_FLEET_MANAGEMENT_URL`, `MQTT_FLEET_API_KEY`,
`MQTT_FLEET_API_SECRET` (same Dedicated deployment's management/publish API).
The server derives fleet publishing URL from the management URL, avoiding
an independent publish-URL configuration that could silently target Serverless.
The pilot keeps its original host, credentials and publish API. Fleet enablement
is independent from `MQTT_PILOT_ENABLED` and remains **false** until a live
two-device broker test has verified account creation, cross-device subscription
denial and revocation. Ensure the configured management endpoint and MQTT
endpoint belong to the *same* Dedicated deployment in its console before enabling.
No per-device source edit or extra flash is needed for hostname migration.


## Alternative fleet provider: Ably scoped JWT (16 October 2026)

**Candidate only. Not activated or validated with a live Ably account.** Ably's
MQTT 3.1.1 adapter supports token authentication and individually restricted
channel capabilities without maintaining an account for each frame.

New server-only settings (Production only after two-frame negative testing):

- `MQTT_FLEET_PROVIDER=ably_jwt_v1`
- `MQTT_FLEET_ENABLED=true` (**keep false until live verification**)
- `MQTT_ABLY_API_KEY`: a new Ably application's secret API key, configured
  directly in Vercel; **never put it in firmware, GitHub or a support message**.
- `MQTT_ABLY_ROOT_CA_PEM`: verified *public* PEM trust anchor for
  `main.mqtt.ably.net:8883`; **required** for this provider. Verify the
  actual broker chain before setting; the old EMQX CA is not assumed valid.

The backend first validates the physical RE:MIND device token and an existing
`device_members` pairing. It then signs a 60-minute Ably JWT containing
`x-ably-clientId=deviceId` with exactly one capability:
`remind/pilot/revisions/{deviceId}: ['subscribe']`. No broker user creation,
fleet password HMAC, or new customer-facing toggle is required. The JWT is
delivered only over authenticated no-cache RE:MIND HTTPS.

**MQTT firmware support:** Ably MQTT's username is the JWT and its password
is empty. The new universal MQTT build accepts `mqtt_auth=ably_jwt_v1` and
`token_ttl_sec=3600`, limits keepalive to 60 seconds, subscribes with QoS 0,
and proactively reconnects for a fresh JWT after 50 minutes. Firmware still
supports the original EMQX deviceId/password contract (90s keepalive, QoS 1).
The MQTT buffer is increased for JWT authentication only. A missed message,
disconnect or token-renewal failure always falls back to authoritative HTTPS
revision checks and physical display ACK.

Backend publishes hints through the Ably REST API against the same application
specified by `MQTT_ABLY_API_KEY`. `main.mqtt.ably.net` is the documented
MQTT adapter hostname; `main.realtime.ably.net` is Ably's documented REST
API hostname. We must verify both reach the same Ably application using a real
API key before rollout. The legacy prototype remains on its original EMQX
account while `MQTT_PILOT_ENABLED=true`; turning that flag off and enabling
the Ably fleet on a controlled test deployment migrates the prototype through
the same authenticated credential endpoint, with no source changes.

**Provider limitations to verify physically:** Ably MQTT subscriptions are
QoS 0, will/retain are not supported, and MQTT needs TLS on 8883. The
application-level durable revision and 15-minute HTTPS safety check are
essential. Check token renewal, broker ACL isolation (cross-device and wildcard
subscriptions), negative publish permissions, expiry, disconnect recovery,
TLS hostname validation and whole-board power measurements. JWTs already
issued remain valid until expiry unless Ably token revocation is configured;
production unpair/reset security requires a deliberate revocation strategy
and a tested lifecycle response. Short-lived tokens are not equivalent to
instant revocation.

No live Ably credentials, broker connections, topic isolation or battery
results have been verified by CI. Do not activate commercial fleet MQTT or
recommend flashing this build solely on the basis of passing compilation.

Official docs:
- https://ably.com/docs/protocols/mqtt
- https://ably.com/docs/auth/token/jwt
- https://ably.com/docs/auth/capabilities
- https://ably.com/docs/api/rest-api
