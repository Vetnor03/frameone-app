# RE:MIND MQTT push pilot (NOT deployed / NOT enabled by default)

## Objective

A/B test **authenticated MQTT revision hints** against existing **10-second
HTTPS revision polling** on the same Alfred V1.2 ESP32-S3, same Wi-Fi/router,
same software modules, and same battery power setup.

**Do not conclude that MQTT saves power from packet counts alone.** A second
persistent TLS socket, keepalive, router listen-beacon behavior, and TLS
reconnects can offset or exceed the removed HTTPS requests. Measure the
complete board current over hours/days before considering this production.

Normal app/firmware behavior is unchanged unless the pilot is *explicitly*
configured and compiled. No firmware OTA or broker is deployed by this code.

## Broker requirements (before the pilot can function)

1. Managed EMQX Serverless MQTT 3.1.1 broker with a valid public CA-signed
   certificate on port 8883. The test firmware pins the **DigiCert Global
   Root G2 public CA** uploaded from the deployment for MQTT TLS. HTTPS to
   RE:MIND still uses its separate ISRG root set. Hostname and certificate
   validation must always remain enabled.
2. Per-device MQTT authentication: MQTT username is the frame's device ID;
   MQTT password is a **separate EMQX password**, kept as a sensitive Vercel
   variable for the single test frame. After verifying physical-frame Bearer
   auth, the RE:MIND API delivers it only to the one enabled, allowlisted
   device. The MQTT password is never built into firmware, committed to GitHub,
   or used as the RE:MIND HTTP token. Never permit anonymous broker access.
3. A per-device **subscribe-only ACL** for exactly
   `remind/pilot/revisions/{authenticated device_id}`. Deny wildcard
   subscriptions, publishing, other device topics, and anonymous sessions.
   Keep broker/API management credentials entirely separate from device tokens.
4. Server-only EMQX publish credentials (or a compatible custom bridge).
   **Do not** expose management endpoints or credentials to the PWA or frame.

The first prototype broker and username were manually configured in EMQX
Cloud; this is **not** an automated production-provisioning implementation.
Future units need a factory/secure provisioning service with unique credentials,
rotation and deprovisioning before MQTT can be shipped commercially.

## Server configuration

Only when the pilot has passed code, broker and physical security checks:
- `MQTT_PILOT_ENABLED=true` (deliberately **UNSET** until ready)
- `MQTT_PILOT_DEVICE_ID=frm_54AE37455F34` (scope to this one prototype)
- `MQTT_PILOT_FRAME_PASSWORD` (sensitive; EMQX password, never checked in)
- `MQTT_PILOT_EMQX_PUBLISH_URL=https://<managed-broker-api>/publish`
  (alternatively a secure `/api/v5/publish` endpoint)
- `MQTT_PILOT_EMQX_API_KEY` (server-side)
- `MQTT_PILOT_EMQX_API_SECRET` (server-side)

The authenticated Update API **first commits** the durable Supabase revision.
It then makes a best-effort, time-bounded (1.8-second) call to the broker's
HTTPS API, publishing QoS 1, **non-retained**, revision-only messages.

If disabled, publication makes **zero network calls**. If publishing fails,
times out, or there are no subscribers, the original REST request and its
durable revision still succeed; the frame's fallback retrieves it.

## Firmware test candidate

Build the separate **alfred_v1_2_mqtt_pilot** PlatformIO environment.
The test broker's public hostname is included in pilot source only:
`i5138504.ala.us-east-1.emqxsl.com:8883`. Never embed the EMQX
password, App ID, App Secret, or RE:MIND device token in firmware.

Keep this hostname test-only and **never** embed broker administrator secrets.
Firmware authenticates to RE:MIND HTTPS using its existing frame token to
request `/api/device/mqtt-pilot/credentials?device_id=...`. The endpoint
returns a separate MQTT username/password only when `MQTT_PILOT_ENABLED=true`,
the device ID matches the explicit `MQTT_PILOT_DEVICE_ID` allowlist, and the
physical frame Bearer token matches the token stored for that device. MQTT
then connects with the separate account; it never sends the HTTP frame token
to the broker. Both network transports verify TLS certificates.
The standard firmware builds still define `FRAME_MQTT_PILOT_ENABLED=0`.

The experimental MQTT client:
- subscribes to only its own topic, with QoS 1;
- wakes/works on existing ~10-second firmware idle cadence;
- treats a broker message as a **hint** and always verifies it through the
  existing authenticated HTTPS revision API before rendering;
- retains physical revision ACK and display feedback as the only completion
  evidence;
- runs a **15-minute HTTPS safety check** while subscribed for lost/offline
  MQTT messages;
- returns to the original **10-second HTTPS polling** whenever MQTT isn't
  connected, with bounded 60-second connection retry spacing;
- retains existing module deadlines and scheduled content refresh logic;
- changes no Power Save mode behavior, app settings or physical frame pairing.

MQTT session keepalive is 90 seconds. Actual keepalive wake frequency and
broker idle disconnect behavior must be measured with the target router.
The MQTT frame session is not an additional way to push arbitrary content.

## A/B benchmark acceptance criteria

Use the *same* device and power meter. Run 4+ hours idle and 30+ real user
updates per configuration, ideally repeating across two home routers.

| Metric | Existing HTTPS | MQTT pilot |
| --- | --- | --- |
| Average **whole-PCB** current on battery | measure | measure |
| Wi-Fi association count per hour | measure | measure |
| Radio wake/CPU active duration | measure | measure |
| HTTPS/TLS requests per hour | measure | measure |
| MQTT keepalive & reconnect count | N/A | measure |
| Update tap -> e-paper ACK p50/p95 | measure | measure |
| Missed updates after broker/router outage | baseline | verify fallback |
| Manual Update feedback correctness | verify | verify |

**Go/no-go:** adopt MQTT only if full-board average current is meaningfully
lower (suggest >=15% sustained improvement), update latency remains comparable,
all revisions eventually display under simulated broker/Wi-Fi failures, and
per-device broker ACL/auth has passed security review. If not, remove/disable
the MQTT pilot and keep the already optimized HTTPS + auto light-sleep path.

Note that current firmware only attempts Wi-Fi automatic light sleep if its
underlying Arduino/ESP-IDF SDK was built with PM + tickless idle. The stock
Arduino 2.0.14 toolchain may not have these flags; verify `power_mode`
telemetry, the flashed binary and actual current **before** interpreting results.
