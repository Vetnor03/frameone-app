# Firmware TLS hardening: physical acceptance / rollback

Scope: `frame/src/network/NetClient.cpp` (all API traffic), `FirmwareUpdater.cpp` (OTA manifest + firmware image), shared `BackendTrust` ISRG Root X1/X2 anchors, and `TimeSync.cpp`. No API/database/pairing-v2 protocol changes.

## Operational assumptions

- `BASE_URL` is `https://re-mind.no` and Vercel's automatically managed certificates chain to Let's Encrypt. The OTA manifest currently returns `https://re-mind.no/firmware/frame-*.bin` — same trusted origin.
- This firmware explicitly rejects plaintext HTTP, lookalike/off-origin hosts, URL-embedded credentials, and 3xx redirects on all backend/OTA requests. If hosting or artifact URLs change, review the new origin, certificate chain, and deployment path before release. Never use an insecure fallback to preserve availability.
- ISRG Root X1/X2 are public root CA certificates, **not** leaf-certificate pins. Routine leaf/intermediate renewal under the same root remains supported; an actual CA/provider change needs a firmware trust-anchor update while the old origin is still reachable. X1 expires June 2035; X2 September 2040. Do not wait until expiration to plan renewal.
- A fresh/invalid wall clock causes backend and OTA requests to fail closed until NTP synchronization. Existing successful network requests reuse the ESP32 RTC; this change does not introduce extra background polling.
- The existing boot call to `TimeSync::ensure(8000)` remains intact. The network transport retries only after Wi-Fi association as before; a clock failure returns an ordinary failed request.
- **This is not pairing-v2.** Existing `/pair/status` token exposure and ID-only `/pair/start` remain open until replacement/cutover. Do not expand pilots based on TLS alone.

## Pre-merge validation

1. Run repository Node tests including `tests/firmware-verified-tls.test.mjs`, the canonical PlatformIO Alfred build, diagnostic build, ESP32 fallback build, and flat Arduino IDE sketch compile on pinned ESP32 core 2.0.14.
2. Confirm a production frame receives valid NTP/RTC time and successfully makes an authenticated `GET /api/device/frame-config`, refresh probe, manual update and both pairing start/status requests over verified TLS. Check heap/PSRAM, keep-alive behavior, and battery/power-save behavior.
3. Check an OTA manifest and a same-origin binary fetch. **Never trigger an actual OTA install on a production frame merely to test TLS**; use a spare device and known-good signed/reproducible artifact. Firmware signing/secure boot remain separate acceptance items.
4. Negative test with a test backend/proxy: wrong-host or untrusted certificate must fail, expired/not-yet-valid certificate must fail, clock absent must fail, and an HTTPS -> HTTP/off-host redirect must not be followed. Confirm no credential is logged and no fallback turns off validation.
5. Verify re-mind.no's *live* served chain on deployment day. This execution environment could not directly resolve the hostname for certificate inspection; root selection is based on Vercel's documented default LE CA and should not be taken as live-chain confirmation.

## Rollback / staging

- This PR is firmware-only. It must not be automatically flashed to all pilot units before physical verification.
- A certificate mismatch intentionally prevents access and OTA (fail closed). Keep a local USB flash/recovery image on hand; do not restore `setInsecure()` on failure.
- If Vercel changes certificate provider, update the trust set and validate with the actual new chain through a reviewed firmware release. OTA URL redirection to arbitrary storage/CDN hosts is not allowed without explicit authenticated-origin design.
- After the physical TLS smoke test, begin the v2 physical identity/enrollment PR. Rotate legacy tokens only once v2's authenticated delivery + recovery path has been exercised on real hardware.
