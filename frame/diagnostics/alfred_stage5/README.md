# RE:MIND Alfred Stage 5 sleep-current diagnostic

This standalone sketch puts the **ESP32-S3-WROOM-1-N16R8** into indefinite
deep sleep for an external battery-current measurement. The display remains
disconnected. GPIO12 (`EPD_PWR`, active HIGH) is forced and retained LOW. The
sketch deliberately has no timer or other wake source and does not use the
display, SPI, I2C, storage, networking, OTA, or the MAX17048.

> **Do not use MAX17048 readings.** Alfred V1.0 has incorrect fuel-gauge wiring;
> only an external multimeter measurement is valid for this test.

## Exact Arduino IDE settings

Use an ESP32 Arduino boards package compatible with the production toolchain
(Arduino-ESP32 **2.0.17**) and select:

| Setting | Value |
| --- | --- |
| Board | ESP32S3 Dev Module |
| USB CDC On Boot | Enabled |
| CPU Frequency | 240MHz (WiFi) |
| Core Debug Level | None |
| Erase All Flash Before Sketch Upload | Disabled |
| Events Run On | Core 1 |
| Flash Mode | QIO 80MHz |
| Flash Size | 16MB (128Mb) |
| JTAG Adapter | Disabled |
| Arduino Runs On | Core 1 |
| USB Firmware MSC On Boot | Disabled |
| Partition Scheme | 16M Flash (3MB APP/9.9MB FATFS) |
| PSRAM | OPI PSRAM |
| Upload Mode | UART0 / Hardware CDC |
| Upload Speed | 921600 |
| USB Mode | Hardware CDC and JTAG |
| Zigbee Mode | Disabled |
| Serial Monitor | 115200 baud |

## Upload and arming workflow

The source defaults to the mandatory safe setting
`ALFRED_STAGE5_CURRENT_TEST_ARMED 0`. Follow this order exactly:

1. Leave the **display disconnected**.
2. Leave the **battery disconnected**.
3. With the arm value at `0`, upload the unarmed sketch using USB only.
4. At 115200 baud, verify `Armed state: UNARMED`, `EPD_PWR state: LOW`, and a
   safe-idle status every five seconds. It must never enter deep sleep.
5. Disconnect USB.
6. Set `ALFRED_STAGE5_CURRENT_TEST_ARMED` to `1` and compile.
7. With the battery still disconnected, connect USB and upload the armed version.
8. Watch the startup and shutdown reports. Wait for
   `ENTERING INDEFINITE DEEP SLEEP FOR CURRENT MEASUREMENT`.
9. Disconnect USB. The board now has no wake source; a reset or power cycle is
   required to run code again.
10. Only now proceed through the separate series-meter steps below to measure
    battery current.

## Series multimeter procedure

> **DANGER: Never place a current meter directly across BAT+ and GND.** That is
> a short circuit, not a current measurement. **Do not connect the battery until
> instructed below. Incorrect meter configuration can short the battery**, damage
> the board or meter, overheat wiring, or cause battery fire.

1. Confirm USB and the display are disconnected and the armed sketch reached
   its deep-sleep message before USB was removed.
2. Keep the battery disconnected. Inspect the battery and leads; stop if they
   are damaged, swollen, warm, or their polarity is uncertain.
3. Put the black lead in the meter `COM` jack and the red lead in the meter's
   **fused high-current** jack. Select DC current and the highest current range.
4. Verify the meter fuse, lead placement, DC-current mode, and expected polarity
   using the meter manufacturer's instructions. Never rotate the selector out
   of current mode while the circuit is connected.
5. Construct an open series path: battery negative to board `BAT-`/GND; battery
   positive to the meter red lead; meter black lead to board `BAT+`. Leave one
   connection open while checking polarity a final time.
6. Only after all checks, connect the battery by closing that final series
   connection. The meter is now part of the sole battery-current path.
7. Allow the reading to stabilize. If it is safely below the next fused range,
   disconnect the battery, move the lead/range, re-check the setup, and reconnect
   in series. Never change jacks or ranges with the battery connected.
8. Record the stable reading. Disconnect the battery before removing the meter
   or reconnecting USB.

If the meter overloads, a fuse opens, anything warms, or the reading is
unexpected, disconnect the battery immediately and investigate before retrying.

## Static check

From the repository root:

```sh
python3 frame/diagnostics/alfred_stage5/check_stage5_static.py
```

The checker enforces the arm default, startup ordering, LOW-only GPIO12 policy,
input state for disconnected e-paper signals, indefinite sleep configuration,
hold and error checks, forbidden subsystems, and Stage-5-only working-tree scope.
