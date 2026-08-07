# Alfred Stage 7 — power-path and 3.3 V rail diagnostic

This standalone diagnostic exercises an Alfred (ESP32-S3-WROOM-1-N16R8) as an active Wi-Fi load while a technician changes between battery-only and USB-plus-battery power. It observes the BQ24074 status outputs and supports a manual TPS63070 `+3V3` measurement. The display must remain disconnected. It does not read the MAX17048 V1.0 because those readings are invalid.

## Safety and interpretation

- `GPIO12 / EPD_PWR` is made an output LOW before Serial or Wi-Fi and is continually forced LOW. It must never be HIGH.
- `GPIO17 / BQ_PGOOD_N` and `GPIO18 / BQ_CHG_N` are input-only. GPIO4, 5, 6, 7, 10, and 11 are untouched.
- `PGOOD_N HIGH` means no valid USB input (battery-only); `LOW` means valid USB input is present.
- `CHG_N LOW` is the raw active-low charging indication. `HIGH` means charging is not active, charge may have completed, no battery may be present, or another documented non-charging condition applies. **Never infer exact battery state of charge from CHG_N.**
- There is no display/SPI, I2C/fuel-gauge, flash storage, Bluetooth, or intentional reboot behavior.

The sketch defaults to the safe setting:

```cpp
#define ALFRED_STAGE7_POWER_PATH_TEST_ARMED 0
```

At `0`, Wi-Fi is off and the sketch only maintains the safe pins, samples the status inputs, and reports every five seconds when Serial is available. Review the safe build before changing the value to `1`.

## Credentials

Copy `AlfredStage7Secrets.example.h` to the ignored local file `AlfredStage7Secrets.h`, then replace both placeholder values. Never commit that local file.

```cpp
#define ALFRED_WIFI_SSID "replace-me"
#define ALFRED_WIFI_PASSWORD "replace-me"
```

The armed sketch uses STA mode with sleep disabled. `WiFi.persistent(false)` is called before mode or connection setup, preventing credentials from being written persistently.

## Arduino IDE settings

| Setting | Value |
| --- | --- |
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

The named partition scheme does not imply that this diagnostic uses its filesystem; Stage 7 performs no storage operations.

## Phase A — safe upload validation

1. Leave the display disconnected.
2. Disconnect the battery.
3. Set the arm to `0`.
4. Compile.
5. Upload using USB only.
6. Verify safe idle: Wi-Fi is OFF, EPD_PWR is LOW, and both status pins are inputs.
7. Power down.
8. Set the arm to `1`.
9. Compile.
10. Upload using USB only.
11. Confirm the diagnostic operates and joins Wi-Fi.
12. Power down.

## Phase B — actual power-path test

1. Disconnect USB.
2. Confirm that the display is disconnected.
3. Connect a normal, intact battery.
4. Wait at least 20 seconds.
5. Measure TP3 to TP4 as described below.
6. Connect USB without disconnecting the battery.
7. Open Serial Monitor at 115200 baud.
8. Confirm the stored battery-only state and the PGOOD transition in the history.
9. Measure TP3 to TP4 again.
10. Leave USB and battery connected for at least 2 minutes.
11. Observe raw CHG_N. A LOW-to-HIGH transition is recorded, but HIGH alone is not proof of full charge.
12. Disconnect USB while leaving the battery connected.
13. Wait at least 20 seconds.
14. Measure TP3 to TP4 again.
15. Reconnect USB.
16. Inspect the preserved transition history and reset flags.

USB removal normally removes the CDC Serial connection, not MCU power. USB insertion/removal must not intentionally reboot Alfred. The latest 48 status transitions and minimal session/reset state reside in no-init RTC-retained RAM and use no flash. Retention is best-effort across MCU software, watchdog, or brownout resets only when the RTC memory domain survives. If an insertion or removal nevertheless resets the MCU and the retained record survives, the active-session marker makes Stage 7 report `UNEXPECTED RESET DETECTED` without silently clearing its history.

A complete loss of board power, including battery removal with USB absent, can clear or invalidate the retained session. On every boot the sketch checks the retained magic value **before** reading any other retained field. An invalid magic value causes the entire record to be cleared and starts a fresh session, preventing stale or random no-init memory from being trusted. Reports distinguish whether a valid retained record was found at boot from the current number of history entries; merely setting the magic for a fresh session is not described as preserved history.

## Manual +3V3 measurement

Use a multimeter in **DC VOLTAGE** mode:

- Black probe → **TP3 (GND)**
- Red probe → **TP4 (+3V3)**

Measure and record the minimum and maximum observed voltage during each condition:

1. battery-only;
2. USB insertion;
3. USB + battery;
4. USB removal back to battery-only.

**Never use current mode across TP3 and TP4.** That would place the meter's low-resistance current path across the supply.

## Reading the results

Stage 7 deliberately reports individual observations rather than one oversimplified overall result:

- Battery-only PGOOD state correct: PASS/FAIL
- USB-present PGOOD state correct: PASS/FAIL
- Return-to-battery PGOOD state correct: PASS/FAIL
- Unexpected reset detected: YES/NO
- GPIO12 fault: YES/NO
- Wi-Fi recovered after source transitions: YES/NO
- Retained RTC record found at this boot: YES/NO
- Transition history entries retained at boot: count
- Transition history entries currently available: count

CHG_N remains informational. The five-second report also includes uptime, raw pins, interpreted source/charger states, Wi-Fi and RSSI, disconnect/reconnect counters, minimum heap, and transition totals. Each history entry contains boot number, uptime timestamp, signal, prior state, and new state. During a normal battery → USB → battery sequence, an already-valid Wi-Fi connection that remains continuously connected is confirmed by the main loop and reports recovery `YES`; a redundant reconnect or GOT_IP event is not required. A disconnect immediately invalidates the current connection's IP evidence, so disconnected or associating states report recovery `NO` until a newer GOT_IP is consumed. After an unexpected reset, the current-connection valid-IP flag starts false and likewise requires a fresh post-reset GOT_IP event.

Run the repository safety checker before use:

```bash
python3 frame/diagnostics/alfred_stage7/check_stage7_static.py
```

This is a hardware observation aid. Record the four voltage readings and review the history/reset evidence together; software status pins do not replace the manual rail measurements.
