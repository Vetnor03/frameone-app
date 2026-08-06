# RE:MIND Alfred Stage 4 deep-sleep diagnostic

This standalone diagnostic tests deep sleep, RTC memory retention, and timer
wake-up on the **ESP32-S3-WROOM-1-N16R8**. It deliberately does not use the
display, radios, storage, or production configuration.

## Hardware safety and first test

Before powering the board, verify all of the following:

- **Display disconnected**
- **Battery disconnected**
- **USB-only first test** using native USB CDC

GPIO12 controls `EPD_PWR`, is active HIGH, and has an external pulldown. The
sketch always drives and holds it LOW; it never powers the disconnected display.
It does not configure GPIO4, GPIO5, GPIO6, GPIO7, GPIO10, or GPIO11.

> **Keep the test unarmed initially.** `ALFRED_STAGE4_SLEEP_TEST_ARMED` must
> remain at its default value of `0` for the first upload and safe-idle check.
> Only change it to `1` for the deliberate deep-sleep test after verifying the
> wiring, startup report, and LOW `EPD_PWR` state.

## Exact Arduino IDE settings

| Setting | Value |
| --- | --- |
| Board | ESP32S3 Dev Module |
| USB CDC On Boot | Enabled |
| Flash Size | 16MB |
| PSRAM | OPI PSRAM |
| USB Mode | Hardware CDC and JTAG |
| Upload Mode | UART0 / Hardware CDC |
| Partition Scheme | 16M Flash (3MB APP/9.9MB FATFS) |
| Serial Monitor | 115200 |

Open **Serial Monitor at 115200** after uploading. Every boot waits up to three
seconds for native USB serial. The USB serial connection may temporarily
disappear during deep sleep and reconnect after each wake; reopen the monitor if
your host does not reconnect automatically.

## Procedure and expected result

1. With the arm value still `0`, upload and confirm `Armed: NO`, `EPD_PWR state:
   LOW`, and a safe-idle report every five seconds. The unarmed sketch never
   enters deep sleep.
2. Close Serial Monitor, deliberately change the arm value to `1`, upload, and
   reopen Serial Monitor at 115200.
3. The initial boot pauses for ten seconds, sleeps for 15 seconds, and wakes from
   its timer. It repeats until three timer wakes have been counted in RTC memory.
4. Confirm `FINAL PASS: three timer deep-sleep wake cycles completed`. The board
   then remains awake in safe idle and reports uptime, wake counter, `EPD_PWR`,
   free heap, and minimum free heap every five seconds.

Any unexpected wake source or counter state produces a clear failure and stops
the sequence without rebooting or retrying. GPIO12 remains LOW on failure.

## Static safety check

From the repository root, run:

```sh
python3 frame/diagnostics/alfred_stage4/check_stage4_static.py
```

The check validates the arm default, GPIO12 ordering and deep-sleep hold flow,
the three-wake threshold and RTC counter, forbidden APIs and protected pins, and
that the working-tree changes are confined to this Stage 4 directory.
