# Alfred Stage 2 controlled e-paper validation

## 1. Purpose

This standalone Arduino diagnostic performs the first controlled validation of Alfred V1.0's switched e-paper power rail, level-shifted SPI/control signals, and the existing RE:MIND 7.5-inch 800 x 480 monochrome e-paper panel.

This is **not production firmware**. It does not integrate Alfred into `frame/src/frame_v2.5.1.ino` and it does not use production rendering.

## 2. Confirmed Alfred display pin map

Source of truth: `docs/ALFRED_HARDWARE_MAP.md`.

| Function | Alfred GPIO | Net |
| --- | ---: | --- |
| BUSY | GPIO4 | EPD_BUSY |
| RESET | GPIO5 | EPD_RST |
| DC | GPIO6 | EPD_DC |
| CS | GPIO7 | EPD_CS |
| SCK | GPIO10 | EPD_SCK |
| MOSI | GPIO11 | EPD_MOSI |
| Power enable | GPIO12 | EPD_PWR |
| MISO | unused | not used |

`EPD_PWR` is active high. U8 `TPS22929D` switches the `EPD_VCC` rail, and R17 provides a 100k pull-down so display power defaults off.

## 3. Exact display driver and why it was selected

The existing production display type aliases `FrameDisplay` to:

```cpp
GxEPD2_BW<GxEPD2_750_T7, GxEPD2_750_T7::HEIGHT>
```

`frame/platformio.ini` pins `zinggjm/GxEPD2@1.6.4`. `DisplayCore.cpp` constructs the working production display object with `GxEPD2_750_T7(EPAPER_CS, EPAPER_DC, EPAPER_RST, EPAPER_BUSY)`. `Config.h` documents the physical panel resolution as 800 x 480. Therefore Stage 2 uses the same library and class: **GxEPD2 1.6.4** and **`GxEPD2_750_T7`**.

The GxEPD2 1.6.4 `GxEPD2_750_T7` class declares WIDTH=800, HEIGHT=480, monochrome operation, BUSY active level LOW, a 10,000,000 us BUSY timeout, `power_on_time=140 ms`, `power_off_time=42 ms`, and `full_refresh_time=4200 ms`.

## 4. Exact Arduino IDE settings

Use these settings and do not upload until the sketch has been reviewed locally:

- Board: ESP32S3 Dev Module
- USB CDC On Boot: Enabled
- CPU Frequency: 240 MHz
- Flash Mode: QIO 80 MHz
- Flash Size: 16 MB
- PSRAM: OPI PSRAM
- USB Mode: Hardware CDC and JTAG
- Upload Mode: UART0 / Hardware CDC
- Upload Speed: 921600
- Partition Scheme: 16M Flash (3MB APP / 9.9MB FATFS)
- Serial Monitor: 115200 baud

Install Arduino libraries:

- GxEPD2 1.6.4
- Adafruit GFX Library, as required by GxEPD2

## 5. Connect the e-paper cable only with all power removed

Connect or disconnect the e-paper FPC only when **USB is disconnected and the battery is disconnected**. Never hot-plug the panel.

## 6. Battery must remain disconnected for the first test

The first Stage 2 run is a USB-only test. Leave the battery disconnected.

## 7. USB-only test procedure

1. Disconnect USB.
2. Disconnect the battery.
3. Connect the e-paper FPC only after all power is removed.
4. Open `frame/diagnostics/alfred_stage2/Alfred_Stage2_Display_Test.ino` in Arduino IDE.
5. Verify the Arduino settings above.
6. First compile with `ALFRED_STAGE2_PANEL_TEST_ARMED` left at `0`.
7. Upload only after local review.
8. Open Serial Monitor at 115200 baud and confirm the unarmed safe output.
9. Disconnect USB.
10. Reopen the sketch, change the arming macro from `0` to `1`, compile, and upload for the one armed test.
11. Do not reset repeatedly to refresh the panel unless intentionally re-running this diagnostic.

## 8. Compile-time arming procedure

Default safe line:

```cpp
#define ALFRED_STAGE2_PANEL_TEST_ARMED 0
```

To arm one controlled refresh, deliberately change it to:

```cpp
#define ALFRED_STAGE2_PANEL_TEST_ARMED 1
```

Do not commit or leave the sketch armed after testing.

## 9. Exact expected Serial sequence

### Unarmed

```text
================================
RE:MIND Alfred Stage 2
Controlled e-paper test
================================
Test armed: NO
EPD_PWR state: LOW
Display driver/library selected: GxEPD2 1.6.4 via <GxEPD2_BW.h>
Exact panel class selected: GxEPD2_750_T7
Panel resolution: 800 x 480 monochrome
Confirmed pin mapping: BUSY=GPIO4 RST=GPIO5 DC=GPIO6 CS=GPIO7 SCK=GPIO10 MOSI=GPIO11 PWR=GPIO12
SPI frequency: 4000000 Hz
USB-only test: YES - battery must remain disconnected for first Stage 2 run
WARNING: exactly one full refresh will occur when armed; reset required to run again.
WARNING: connect or disconnect the panel only with USB and battery removed.
Stage 2 is not armed. GPIO12 remains LOW. SPI/display communication is disabled.
SAFE IDLE: Unarmed safe idle; EPD_PWR=LOW; refresh_attempted=NO
```

The compact `SAFE IDLE` line repeats about every 5 seconds.

### Armed

```text
================================
RE:MIND Alfred Stage 2
Controlled e-paper test
================================
Test armed: YES
EPD_PWR state: LOW
Display driver/library selected: GxEPD2 1.6.4 via <GxEPD2_BW.h>
Exact panel class selected: GxEPD2_750_T7
Panel resolution: 800 x 480 monochrome
Confirmed pin mapping: BUSY=GPIO4 RST=GPIO5 DC=GPIO6 CS=GPIO7 SCK=GPIO10 MOSI=GPIO11 PWR=GPIO12
SPI frequency: 4000000 Hz
USB-only test: YES - battery must remain disconnected for first Stage 2 run
WARNING: exactly one full refresh will occur when armed; reset required to run again.
WARNING: connect or disconnect the panel only with USB and battery removed.
Powering EPD_VCC: GPIO12 HIGH
EPD_PWR state after enable: HIGH
Initializing explicit Alfred SPI bus: SCK=GPIO10 MOSI=GPIO11 MISO=unused CS=GPIO7
BUSY wait start: before display.init raw=...
BUSY wait done: before display.init elapsed_ms=... raw=...
Initializing GxEPD2_750_T7 with reset_duration=10ms, pulldown_rst_mode=false
BUSY post-check after display.init: raw=...
Starting exactly one full black-and-white refresh.
...
BUSY post-check after full refresh: raw=...
Refresh completed.
Putting panel into documented GxEPD2 hibernate state.
BUSY post-check after hibernate: raw=...
Waiting documented panel shutdown interval: 42 ms
FINAL PASS: Stage 2 display refresh completed once; EPD_PWR is LOW.
The retained e-paper image may remain visible after power is removed; this is expected.
SAFE IDLE: PASS safe idle; EPD_PWR=LOW; refresh_attempted=YES
```

The GxEPD2 library may also print `Busy Timeout!` if the panel remains busy until its internal timeout.

## 10. Expected panel image

Exactly one full black-and-white refresh should produce:

- White background
- Thin black border
- Black alignment marks near all four corners
- Large centered text: `ALFRED`
- Smaller centered text: `RE:MIND PCB V1.0`
- Smaller centered text: `DISPLAY TEST PASSED`
- Smaller centered text: `ONE FULL REFRESH ONLY`

## 11. BUSY timeout behaviour

`GxEPD2_750_T7` uses BUSY active LOW and a 10,000 ms internal BUSY timeout. Stage 2 additionally prints BUSY start messages, raw BUSY levels, elapsed time during library waits through `setBusyCallback()`, and post-checks BUSY after initialization, refresh, and hibernate. If BUSY is still LOW after a library operation, Stage 2 stops safely, releases SPI/control pins to INPUT, drives `EPD_PWR` LOW, prints a prominent failure, and never retries automatically.

## 12. Pass/fail checklist

Pass only if all are true:

- Initial Serial output shows `EPD_PWR state: LOW`.
- Armed run shows `EPD_PWR state after enable: HIGH`.
- Exactly one full refresh occurs.
- Display shows the expected test image.
- Serial output shows `Refresh completed.`.
- Serial output shows `FINAL PASS`.
- Final idle line shows `EPD_PWR=LOW` and `refresh_attempted=YES`.
- No unusual heat, smell, flicker loop, or repeated refresh occurs.

Fail/stop if any are true:

- `EPD_PWR` reads HIGH before arming.
- `EPD_PWR` does not read HIGH after enabling.
- BUSY timeout is printed.
- The panel does not refresh once.
- The panel refreshes repeatedly.
- Any unusual heat, smell, noise, or visible electrical issue occurs.

## 13. Immediate stop conditions

Immediately remove USB power if you observe unusual heat, smell, smoke, repeated refreshes, unexpected current draw, a shorted cable, or a physically misaligned FPC.

## 14. High-voltage e-paper circuitry warning

Do not touch or probe the display high-voltage/reference circuitry while powered or immediately after shutdown. Alfred includes e-paper rails such as VGH, VGL, VCOM, VSH, VSL, and related charge-pump components that can remain charged briefly.

## 15. Expected retained image after EPD power off

The e-paper image is bistable and may remain visible after Stage 2 calls hibernate and turns `EPD_PWR` LOW. This is expected and is not evidence that the display is still powered.

## 16. Only one refresh occurs

The sketch has no refresh loop. It records `g_refreshAttempted = true` before the page loop and remains in safe idle after pass or fail. Another refresh requires a complete reset and an armed build.

## 17. No network, backend, OTA, pairing or persistent storage

Stage 2 does not initialize Wi-Fi, Bluetooth, backend communication, OTA, pairing, provisioning, deep sleep, MAX17048 writes, or persistent storage. It only uses Serial, explicit SPI for the panel, GPIOs listed above, and the GxEPD2 display library when armed.

## 18. Safely disconnecting the panel afterward

1. Confirm Serial shows `EPD_PWR=LOW`.
2. Disconnect USB.
3. Confirm the battery is still disconnected.
4. Wait at least 30 seconds before touching the FPC area.
5. Disconnect the e-paper FPC carefully without bending or scraping the contacts.

## 19. Unresolved physical FPC orientation question

The repository confirms the Alfred GPIO/net mapping and that J4 is intended for the existing Waveshare 7.5-inch panel, but it does **not** prove the safe physical ribbon insertion orientation from net names alone. Before the first powered panel test, provide close photographs of:

- Alfred's J4 connector
- The display ribbon contact side
- The old working prototype connection

Do not infer orientation from signal names alone.

## 20. Static safety check

Run this repository check before review or merge:

```bash
frame/diagnostics/alfred_stage2/check_stage2_static.py
```

It verifies that the custom `FSPI` instance is explicitly bound to GxEPD2 before `display.init()`, Stage 2 does not call the global/default `SPI.begin()` path, the diagnostic remains unarmed by default, and protected production firmware files are untouched in the working tree.
