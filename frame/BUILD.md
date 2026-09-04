# Physical-frame firmware builds

## Targets

The firmware uses the Arduino framework. PlatformIO provides the reproducible repository/CI build, and Arduino IDE is also supported for the Alfred V1.2 USB workflow.

The classic `frame_esp32` PlatformIO environment remains the default and preserves the existing 4 MB ESP32 profile. It is retained for existing frames; its board-specific assumptions have not been reclassified as Alfred facts.

`alfred_v1_2` is the dedicated hardware profile for the physically verified Alfred V1.2 PCB:

- ESP32-S3 DevKitC-compatible ESP32-S3-WROOM-1-N16R8, 240 MHz
- 16 MB QIO flash and 8 MB OPI PSRAM (`qio_opi`, `BOARD_HAS_PSRAM`)
- native Hardware CDC/JTAG-compatible USB mode and CDC at boot
- 115200 baud monitor
- custom 16 MB dual-OTA table with two 6 MiB application slots

## Arduino IDE workflow

The canonical source stays organized under `frame/src/`. The preparation script makes the familiar flat Arduino folder: it copies the `.ino` plus every firmware `.h`, `.hpp`, `.c`, `.cpp`, and `.S` file into one `frame_v2.5.1` folder, adjusts repository-local include paths, and copies the required Alfred table as `partitions.csv`. It does not modify the canonical source.

Requirements:

- Arduino IDE 2.x
- Espressif ESP32 boards package `2.0.14`
- ArduinoJson `6.21.5`
- Adafruit BusIO `1.17.4`
- Adafruit GFX Library `1.12.6`
- GxEPD2 `1.6.4`

After downloading and extracting the GitHub ZIP, open a terminal in the repository root. On Windows, prepare a new sketch folder with:

```powershell
py frame\tools\prepare_arduino_sketch.py --output "$HOME\Documents\Arduino\frame_v2.5.1"
```

On macOS or Linux:

```sh
python3 frame/tools/prepare_arduino_sketch.py --output "$HOME/Arduino/frame_v2.5.1"
```

The destination must be new or empty, and its final folder name must remain `frame_v2.5.1`. This prevents a removed/renamed module from lingering as a stale source file. Open `frame_v2.5.1.ino` from that generated folder in Arduino IDE. You can still edit or replace individual `.h`/`.cpp` files there; rerun the preparation into a new empty folder whenever you want a guaranteed clean copy of the repository version.

Select these Tools menu values:

| Arduino IDE setting | Alfred V1.2 value |
| --- | --- |
| Board | ESP32S3 Dev Module |
| CPU Frequency | 240MHz (WiFi) |
| Flash Size | 16MB (128Mb) |
| Flash Mode | QIO 80MHz |
| PSRAM | OPI PSRAM |
| USB Mode | Hardware CDC and JTAG |
| USB CDC On Boot | Enabled |
| Partition Scheme | Minimal SPIFFS (1.9MB APP with OTA/190KB SPIFFS) |

`Partition Scheme` supplies Arduino's compile-time size ceiling. The generated sketch's checked-in `partitions.csv` overrides that built-in table for the actual image and USB upload, providing the two verified 6 MiB OTA slots. Do not omit or rename `partitions.csv`.

Use **Sketch > Verify/Compile** or **Sketch > Export Compiled Binary**. For the first physical test, use the IDE's USB **Upload** only after the PR's required builds are green. Exporting does not publish or replace the production OTA binary/manifest; that remains a separate release action after physical validation.

The CI job executes the same Arduino build non-interactively with this FQBN:

```text
esp32:esp32:esp32s3:CPUFreq=240,FlashMode=qio,FlashSize=16M,PartitionScheme=min_spiffs,PSRAM=opi,USBMode=hwcdc,CDCOnBoot=cdc
```

## PlatformIO workflow

Build from the repository root without producing or publishing any release artifact:

```sh
pio run -d frame -e alfred_v1_2
pio run -d frame -e frame_esp32
pio run -d frame -e alfred_v1_2 -t size
pio run -d frame -e frame_esp32 -t size
```

At runtime, the S3 boot log should report detected PSRAM. Both build paths enable OPI PSRAM, but physical detection remains an on-device validation item for the integrated firmware.

## Current port build report

GitHub Actions run `33909992699` at commit `7d883d172ce2eeec380289fd4a31eec2b06c1af8` passed all pre-Arduino-IDE gates: all 37 Python firmware tests, both `alfred_v1_2` and `frame_esp32` PlatformIO builds, and the Alfred size target. The Alfred image used 1,471,465 of 6,291,456 application bytes (23.4%) and 120,624 of 327,680 bytes of static internal RAM (36.8%). The Arduino IDE/CLI result is recorded by the latest `Frame firmware build` run for the current PR head.

The selected Alfred partition table is `partitions_alfred_16mb.csv`: app0 spans `0x010000..0x60ffff` and app1 spans `0x610000..0xc0ffff`, providing 6,291,456 bytes per OTA slot. No firmware binary or OTA manifest is changed or published by this hardware-port PR.

## Hardware/API port notes

Alfred uses an explicit S3 FSPI instance at 4 MHz, the MAX17048 rather than ADC35, and active-low BQ24074 status signals. Deep-sleep source-change wake uses the ESP32-S3-supported `esp_sleep_enable_ext1_wakeup` API on RTC-capable GPIO17. Display power is asserted only around panel operations and held LOW across deep sleep.

## Continuous compilation

The `Frame firmware build` GitHub Actions job installs the pinned PlatformIO and Arduino dependencies, runs the complete Python firmware test suite, compiles both PlatformIO hardware environments, reports the Alfred size, generates the flat Arduino sketch, and compiles that sketch with the exact Alfred Arduino configuration. It uploads and publishes nothing.

The PlatformIO Alfred environment resolves `boards/alfred_v1_2.json`, rather than inheriting the misleading N8/no-PSRAM DevKitC label. That manifest declares ESP32-S3-WROOM-1-N16R8, 16 MiB flash, 80 MHz QIO flash mode, `qio_opi` Arduino memory type, OPI PSRAM with an expected size of 8 MiB, and the USB CDC/JTAG build flags. PlatformIO 6.6.0 deliberately emits a DIO-compatible ROM image header for a `qio` board setting while selecting `bootloader_qio_80m.elf`; the selected QIO bootloader and `qio_opi` SDK configuration are visible in the verbose CI log. `platformio.ini` independently selects the checked-in `partitions_alfred_16mb.csv` table.
