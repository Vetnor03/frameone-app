# PR #1314: one-frame USB TLS smoke test

**Do not run this against all pilot frames.** This is a test candidate, not an OTA release. It does not fix pairing-v2 or the legacy pairing-token exposure. Preserve a known-working local sketch before testing. Do not erase flash/NVS.

## Get exactly the tested candidate

1. Open the **Frame firmware build** GitHub Actions run for PR #1314's final head commit. Confirm both jobs are green: `live-backend-tls` and `firmware`.
2. Download its **alfred-v1_2-tls-usb-test-pr1314** artifact from the run's **Artifacts** section. The artifact is the canonical **flat Arduino sketch**, including `frame_v2.5.1.ino`, `BackendTrust.cpp/.h`, and `partitions.csv`. GitHub expires it after seven days.
3. Extract it to a new local folder called `frame_v2.5.1`. The `.ino` filename must match its folder. Keep the known-working old sketch in a different folder. Use the exact tested artifact, not stale files from an earlier export.

## Arduino IDE settings (Alfred V1.2, ESP32-S3-WROOM-1-N16R8)

Use ESP32 board package **2.0.14** and the same libraries as CI: ArduinoJson 6.21.5, Adafruit BusIO 1.17.4, Adafruit GFX 1.12.6, GxEPD2 1.6.4.

| Setting | Value |
| --- | --- |
| Board | ESP32S3 Dev Module |
| CPU Frequency | 240 MHz |
| Flash Mode | QIO |
| Flash Size | 16 MB |
| PSRAM | OPI PSRAM |
| USB Mode | Hardware CDC and JTAG |
| USB CDC On Boot | Enabled |
| Partition Scheme | Minimum SPIFFS (the sketch's checked-in custom `partitions.csv` must be present) |
| Erase All Flash Before Sketch Upload | **Disabled** |
| Serial Monitor | 115200 baud |

If the IDE reports a different partition layout, or asks you to erase flash, **stop**. The device token and Wi-Fi settings are stored in NVS. Do not factory-reset or delete the frame for this test.

## Procedure

1. Use a spare or otherwise recoverable Alfred V1.2 frame. Connect USB and **verify its original firmware still updates normally**. Keep the exact previous sketch/image available.
2. Compile the extracted PR #1314 sketch in Arduino IDE, then upload over USB. This is a local USB test; no OTA update or Supabase change.
3. Open Serial Monitor at 115200. Allow Wi-Fi connection and clock sync. The first backend call must succeed with verified TLS; the screen should proceed to the ordinary paired display.
4. From the RE:MIND app, select **Normal mode** and trigger one manual Update. Confirm the physical frame acknowledges it and renders normally. Also exercise a normal scheduled refresh, then optionally check Power Save and recovery after unplug/replug.
5. Check that the existing pairing is preserved: no unexpected new pairing code, no missing token, no repeated Wi-Fi recovery loop. Do not publish unredacted Serial logs: device IDs, pairing codes and any auth data are sensitive.
6. If a spare unpaired frame is available, separately test pairing start/status. Do **not** unpair or reset an already paired pilot frame just to test this.
7. No OTA install is necessary. The manifest fetch already occurs during the normal update check; the CI trust test covers its certificate chain, but a binary download/install should only be tried on a spare with a known-good recoverable image.

### Pass criteria

- Boot, NTP/RTC, verified HTTPS backend API and display update all function.
- No TLS handshake/certificate failure, redirect loop, unintended authentication reset, NVS erase, or significant persistent memory regression.
- Existing device remains paired through restart and charger/power transitions.
- Live GitHub Actions CA-chain check and pinned CI firmware builds both succeed on the exact PR commit.

### Stop and roll back

If the frame cannot reach the API, repeatedly shows pairing/setup unexpectedly, or hangs before normal display, stop the test. Reflash the preserved known-good build **by USB with Erase All Flash disabled**. Do not make the new firmware fall back to `setInsecure()` and do not rotate any credentials.

Hardware results must be recorded before merging PR #1314. A green CI pipeline does not prove ESP32 certificate validation on the actual device.
