# RE:MIND Alfred Stage 6 — battery-only Wi-Fi stress diagnostic

This standalone diagnostic stresses the ESP32-S3-WROOM-1-N16R8 Wi-Fi subsystem for a nominal 60-second period while Alfred is supplied by its LiPo through the onboard power path and TPS63070. GPIO17 (`BQ_PGOOD_N`) electrically verifies that valid USB/VBUS power was absent throughout the measured interval. It records connection, DNS, scan, heap, RSSI, reset, power-source, and GPIO safety evidence in RAM, freezes the result, and only then permits a later USB serial report. It does not use production configuration or storage.

## Mandatory safety warnings

> **STOP and read before powering Alfred.**

- **The display must remain disconnected.** Do not connect or disconnect the e-paper while powered.
- GPIO12 is `EPD_PWR`, active HIGH. This sketch forces it LOW and never intentionally drives it HIGH.
- MAX17048 readings on V1.0 are invalid and must not be used. This diagnostic performs no battery-gauge or I2C access.
- The initial upload is **USB-only with the battery disconnected**.
- Do not connect the battery until the armed firmware has already been uploaded and USB has been removed.
- The battery-only test uses the **normal intact battery**. **Do not use the cut Stage 5 current-test battery.**
- Never measure TP3/TP4 in current mode. Never place an ammeter directly across +3V3 and GND.
- The firmware never reboots intentionally and never writes test state to flash, NVS, EEPROM, or a filesystem.

## Credentials and safety arm

Copy `AlfredStage6Secrets.example.h` to the ignored local file `AlfredStage6Secrets.h`, then replace the two placeholders locally. Never commit that file or real credentials. The password is used by `WiFi.begin` but is never printed.

The committed sketch contains:

```cpp
#define ALFRED_STAGE6_STRESS_TEST_ARMED 0
```

At `0`, Wi-Fi never starts: GPIO12 remains LOW and a safe-idle line is printed every five seconds when Serial is available. Only change this local build value to `1` after completing the unarmed validation. Do not commit an armed value.

## Arduino IDE settings

Use the Alfred-installed **Arduino-ESP32 core 2.0.17**.

| Setting | Value |
|---|---|
| Board | ESP32S3 Dev Module |
| USB CDC On Boot | Enabled |
| CPU Frequency | 240MHz (WiFi) |
| Flash Mode | QIO 80MHz |
| Flash Size | 16MB (128Mb) |
| PSRAM | OPI PSRAM |
| USB Mode | Hardware CDC and JTAG |
| Upload Mode | UART0 / Hardware CDC |
| Upload Speed | 921600 |
| Partition Scheme | 16M Flash (3MB APP/9.9MB FATFS) |
| Serial Monitor | 115200 |

## Test phases and interpretation

1. **Phase 0 — Wi-Fi connection:** station mode, Wi-Fi sleep disabled, 30-second initial timeout. The stress clock starts only after an IP is obtained. Failure freezes a FAIL report.
2. **Phase 1 — battery-only Wi-Fi stress:** nominal deadline 60 seconds, with the real elapsed milliseconds retained. DNS for `re-mind.no` is attempted every two seconds; asynchronous nearby-network scans start every ten seconds only while connected and not associating. Wi-Fi state, RSSI, heap, disconnect reasons, rate-limited main-task reconnect requests, GPIO12, and GPIO17 are monitored. No authenticated API request is made. `BQ_PGOOD_N` HIGH means USB is absent; any LOW permanently records USB power during stress.
3. **Phase 2 — freeze:** active work ends, counters and verdict are copied to frozen RAM/RTC RAM, and the test cannot restart. A completion notice is printed only if Serial happens to exist.
4. **Phase 3 — USB report:** the complete immutable report prints every five seconds whenever native USB Serial becomes available.

PASS requires the expected `frm_88AC499FC114` device ID, an initial connection, normal completion without an active-test reset or GPIO12 fault, connection at completion, at least one DNS success, at least one completed scan, and `BATTERY-ONLY VERIFIED: YES`. Verification requires `BQ_PGOOD_N` HIGH at stress start, never LOW during stress, and HIGH at completion. A recovered temporary disconnect alone does not fail the test.

Minimal RTC RAM state distinguishes a fresh boot, an active run, and a frozen run. A reset seen after the active marker produces a permanent FAIL rather than silently starting again. The frozen result is also copied to RTC RAM so a reset that retains the RTC domain can still be reported. RTC state is deliberately not required to survive complete power removal and nothing is persisted to flash.

### Native USB limitation

The sketch never waits for Serial and physical USB insertion does not intentionally reset it. On correctly configured native USB CDC/JTAG hardware, attaching the cable should merely make Serial available and leave frozen RAM unchanged. Nevertheless, board circuitry, host behavior, or ESP32-S3 USB configuration can cause a physical reset; software cannot absolutely guarantee RAM preservation across such a reset. When the RTC domain survives, the diagnostic restores the frozen RTC copy. If USB insertion removes power or clears RTC RAM, the frozen evidence is unrecoverable. Leave the battery connected, use the documented native USB settings, and confirm that the report says results were frozen before report mode. The firmware does not claim to infer the physical USB insertion time from Serial availability.

## TP3 / TP4 external voltage measurement

During the 60-second battery-only stress test, measure externally with a multimeter:

- **TP3 = GND** — black probe
- **TP4 = +3V3** — red probe
- Meter mode: **DC VOLTAGE**

Never use current mode across TP3 and TP4, and never put an ammeter directly across +3V3 and GND. The diagnostic does not attempt to measure +3V3 internally. Manually record the lowest and highest observed voltage.

## Physical test workflow

### Phase A — USB validation

1. Leave the display disconnected.
2. Leave the battery disconnected.
3. Confirm `ALFRED_STAGE6_STRESS_TEST_ARMED = 0`.
4. Compile.
5. Connect USB only.
6. Upload the unarmed sketch.
7. Confirm safe idle and GPIO12 LOW.
8. Disconnect USB.
9. Change the arm to `1` locally.
10. Compile.
11. Connect USB only; the battery must still be disconnected.
12. Upload the armed sketch.
13. Confirm the diagnostic can connect and operate. Because USB is powering the board, `BQ_PGOOD_N` will be LOW and **`BATTERY-ONLY VERIFIED` will intentionally be `NO`**. This expected FAIL validates firmware behavior only; it is not a software malfunction and is not the battery result.
14. Power down by removing USB.

### Phase B — true battery-only stress test

1. Keep the display disconnected.
2. Keep USB disconnected.
3. Use the normal intact battery, not the cut Stage 5 current-test battery.
4. Connect the battery directly to Alfred.
5. Do not connect USB during the test.
6. Wait for more than 60 seconds after Wi-Fi connection.
7. During the stress period measure TP3-to-TP4 in DC voltage mode.
8. Record the minimum and maximum observed voltage.
9. After at least 60 seconds, leave the battery connected.
10. Connect USB.
11. Open Serial Monitor at 115200.
12. Read the repeatedly printed frozen battery-only report.
13. Confirm the frozen evidence shows `BQ_PGOOD_N` HIGH at start and completion, no USB power seen during stress, and **`BATTERY-ONLY VERIFIED: YES`**. It must also state that post-freeze USB/PGOOD changes cannot modify the result.

## Validation

From the repository root run:

```sh
python3 frame/diagnostics/alfred_stage6/check_stage6_static.py
```

For a compile check, first create the ignored secrets header, then compile using ESP32 Arduino core and the exact settings above. The checker deliberately rejects changes outside this Stage 6 directory except the root ignore rule.

## Example USB-validation report (expected not battery-only)

```text
Result: FAIL
Target stress duration: 60.000 s
Actual stress duration: 60.018 s (60018 ms)
BQ_PGOOD_N at stress start: LOW
BQ_PGOOD_N at stress completion: LOW
USB power seen during stress: YES
BATTERY-ONLY VERIFIED: NO

Detected failures:
- Battery-only power was not verified for the complete stress phase

Results were frozen before report mode.
Changes in USB/PGOOD state after freeze do not modify the frozen result.
```

This is the expected power-source outcome during USB validation; the run validates firmware behavior only.

## Example true battery-only PASS report for Alfred

```text
================================
RE:MIND Alfred Stage 6
BATTERY-ONLY WI-FI STRESS RESULT
================================
Result: PASS

Device ID: frm_88AC499FC114
Device-ID check: PASS

Target stress duration: 60.000 s
Actual stress duration: 60.013 s (60013 ms)
Wi-Fi initially connected: YES
Wi-Fi connected at completion: YES

Disconnects: 1
Reconnect requests: 1

DNS successes: 29
DNS failures: 0

Wi-Fi scans completed: 5
Wi-Fi scans failed: 0

Worst RSSI: -67 dBm
Best RSSI: -55 dBm

Minimum free heap: 238144
Final free heap: 241320

GPIO12 fault detected: NO
EPD_PWR final state: LOW

Battery boot reset reason: POWERON

BQ_PGOOD_N at stress start: HIGH
BQ_PGOOD_N at stress completion: HIGH
USB power seen during stress: NO
BATTERY-ONLY VERIFIED: YES

Recorded disconnect reasons:
8

Detected failures:
NONE

BQ_PGOOD_N remained HIGH for the complete stress phase.
No valid USB input was detected while battery-only results were collected.

Results were frozen before report mode.
Changes in USB/PGOOD state after freeze do not modify the frozen result.

================================
```
