# RE:MIND MQTT — universal frame firmware and fleet rollout

## Important

The binary built as `alfred_v1_2_mqtt_pilot` is **device-agnostic**. It does
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

**Do not ship this firmware commercially until actual physical testing,
reliable automatic provisioning, lifecycle deprovisioning and power/latency
measurements have been completed.** Standard non-MQTT firmware builds remain
unchanged.

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
