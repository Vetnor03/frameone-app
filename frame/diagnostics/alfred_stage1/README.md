# RE:MIND Alfred Stage 1 Diagnostics

## 1. Purpose of Stage 1

Stage 1 is a standalone, uploadable Arduino diagnostic sketch for the approved Alfred hardware map. It verifies basic ESP32-S3 startup information, the safe e-paper power-off state, I2C bus visibility, MAX17048 read-only fuel-gauge communication, and raw BQ24074 charger-status GPIO levels.

This sketch is intentionally separate from production firmware and does not add any diagnostic path to `frame/src/frame_v2.5.1.ino`.

## 2. Hardware requirements

- Alfred board using the confirmed GPIO map in `docs/ALFRED_HARDWARE_MAP.md`.
- USB connection for power, upload, and Serial Monitor.
- Optional later single-cell Li-ion/LiPo battery connected to the board battery connector.
- Serial Monitor set to 115200 baud.

## 3. E-paper must remain disconnected

Leave the physical e-paper panel disconnected for Stage 1. The diagnostic does not initialize SPI, does not load an e-paper library, does not communicate with the display, and does not refresh the display.

## 4. Recommended first test with USB only

1. Leave the e-paper disconnected.
2. Leave the battery disconnected for the first test.
3. Connect USB.
4. Upload `Alfred_Stage1_Diagnostics.ino` from Arduino IDE.
5. Open Serial Monitor at 115200 baud.
6. Confirm GPIO12 / EPD_PWR is reported LOW.

## 5. Optional later test with battery

After the USB-only test passes, repeat with a known-safe single-cell Li-ion/LiPo battery connected. The MAX17048 may then report battery voltage and state of charge if it responds on I2C address `0x36`.

## 6. Exact Arduino IDE settings

Use the bring-up configuration already proven for Alfred:

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

## 7. BOOT procedure using TP2 to TP3 if required

If automatic upload does not enter the ROM bootloader, use the board BOOT procedure:

1. Momentarily short TP2 to TP3 to assert BOOT / GPIO0 as required by the hardware bring-up procedure.
2. Start upload from Arduino IDE.
3. Release the short when the upload begins.
4. Reset the board after upload if needed.

## 8. Expected Serial output

The first clear startup header should be:

```text
================================
RE:MIND Alfred Stage 1
Safe hardware diagnostics
E-paper power: DISABLED
================================
```

The sketch then prints chip, flash, PSRAM, reset, SDK, MAC, GPIO12 / EPD_PWR state, charger raw states, I2C setup, I2C scan results, and MAX17048 read-only diagnostics. Runtime status lines print about every two seconds.

## 9. Charger pin raw states

Stage 1 configures these pins as plain inputs because the schematic includes external pull-ups:

- GPIO17 / BQ_PGOOD_N
- GPIO18 / BQ_CHG_N

The sketch always prints raw states such as:

```text
BQ_PGOOD_N raw state: LOW
BQ_CHG_N raw state: LOW
Interpretation intentionally deferred until BQ24074 truth table is verified.
```

Do not treat these raw states as confirmed charging, charge-complete, fault, USB-present, or USB-absent indicators during Stage 1. Interpretation is deferred until the official BQ24074 truth table is verified for this board.

## 10. Pass/fail checklist

Pass Stage 1 only if all required safety checks pass:

- GPIO12 / EPD_PWR is driven LOW immediately at startup.
- GPIO12 / EPD_PWR remains LOW in startup diagnostics and every runtime status line.
- No component becomes hot.
- Serial output appears at 115200 baud.
- I2C scan completes and does not hang indefinitely.
- The sketch keeps running whether or not the MAX17048 is detected.
- Charger pins are printed as raw HIGH/LOW states.
- No display communication occurs.

## 11. Stop immediately if anything becomes hot

Stop immediately, disconnect USB and battery power, and inspect the board if the ESP32-S3, charger, fuel gauge, display connector area, or any other component becomes hot.

## 12. GPIO12 must remain LOW

GPIO12 / EPD_PWR must remain LOW for the entire Stage 1 run. The first hardware-control action in `setup()` is `pinMode(GPIO12, OUTPUT)` followed by `digitalWrite(GPIO12, LOW)`. A runtime defensive check forces GPIO12 LOW again and prints a warning if it ever reads HIGH.

## 13. Display communication is disabled

Stage 1 does not initialize SPI, e-paper display libraries, display driver circuitry, or BUSY handling. It does not toggle GPIO4, GPIO5, GPIO6, GPIO7, GPIO10, or GPIO11.

## Stage 1 pin list

| Function | GPIO |
| --- | --- |
| BOOT | GPIO0 |
| EPD_BUSY | GPIO4 |
| EPD_RST | GPIO5 |
| EPD_DC | GPIO6 |
| EPD_CS | GPIO7 |
| I2C_SCL | GPIO8 |
| I2C_SDA | GPIO9 |
| EPD_SCK | GPIO10 |
| EPD_MOSI | GPIO11 |
| EPD_PWR | GPIO12 |
| BQ_PGOOD_N | GPIO17 |
| BQ_CHG_N | GPIO18 |
| USB D- | GPIO19 |
| USB D+ | GPIO20 |
| UART_TX / TP7 | TXD0 |
| UART_RX / TP8 | RXD0 |

## No persistent side effects

The diagnostic does not erase flash, store Preferences, modify NVS, connect to Wi-Fi, contact Supabase or any backend, change pairing state, trigger OTA, enter deep sleep, write to the MAX17048, power the e-paper, refresh the e-paper, or upload/flash anything by itself.
