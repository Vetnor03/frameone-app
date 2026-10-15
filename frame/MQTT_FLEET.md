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
- `MQTT_FLEET_DERIVATION_SECRET`: **NEW REQUIRED SECRET for fleet**.
  Generate a unique cryptographically random 48+ character secret, store it as
  a sensitive Production variable in Vercel. Do NOT use the EMQX API secret,
  the prototype's MQTT password, a public device token, or a human-memorable
  password. Keep this stable across redeployments. Changing it requires a
  controlled device credential rotation at the broker.
- `MQTT_BROKER_HOST`, `MQTT_BROKER_PORT`: backend-only broker location,
  validated before delivery. Defaults to the current test broker and 8883.
- `MQTT_BROKER_ROOT_CA_PEM`: optional **public** broker root certificate
  delivered over device-authenticated HTTPS, allowing secure CA migration
  without another frame flash; if absent, firmware uses its bundled public
  DigiCert Global Root G2.
- Existing `MQTT_PILOT_EMQX_API_KEY`, `_API_SECRET`, and
  `_PUBLISH_URL` stay server-side only.

When enabled, the backend derives a different MQTT password for each frame
with HMAC-SHA256 and the dedicated secret. It checks for (or creates) the
broker's password-auth account and ensures the username has exactly one
subscribe-only ACL for `remind/pilot/revisions/{device_id}`. It refuses
unexpected existing accounts, superusers and wider ACLs. After authenticated
onboarding it returns that frame's own MQTT username/password and broker
address over HTTPS. All MQTT messages remain hints that must be verified
against the durable RE:MIND display revision; the broker cannot command
untrusted display content.

## EMQX Serverless limitation — verify before enabling fleet

The EMQX **current Serverless deployment API** documentation explicitly
lists client management, subscriptions and publishing; it does not list
programmatic creation of authentication users or per-user ACL entries, though
an older EMQX Cloud Serverless announcement mentions those capabilities.

Our fleet provisioning uses the EMQX v5 management paths
`/api/v5/authentication/password_based%3Abuilt_in_database/users` and
`/api/v5/authorization/sources/built_in_database/rules/users`, which are
documented for dedicated EMQX deployments. They may be disabled on this
Serverless tier. The code fails closed and the frame automatically uses the
existing 10-second HTTPS update fallback if unsupported. **An automated test
against this actual deployment must succeed before turning on the fleet
switch or assuming all frames can self-provision.** If unsupported, use a
broker tier/provider with these management APIs, or a factory provisioning
pipeline that registers individual users and subscribe-only ACLs before
shipping. The firmware is already compatible with both, and still needs no
per-device source-code changes.

Serverless also has fixed quotas for connections and built-in auth entries.
Track capacity/cost before exceeding the pilot.

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
