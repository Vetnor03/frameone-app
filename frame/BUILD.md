# Physical-frame firmware builds

## Targets

The classic `frame_esp32` environment remains the default and preserves the existing 4 MB ESP32 profile. It is retained for existing frames; its board-specific assumptions have not been reclassified as Alfred facts.

`alfred_v1_2` is the dedicated, reproducible hardware profile for the physically verified Alfred V1.2 PCB:

- ESP32-S3 DevKitC-compatible ESP32-S3-WROOM-1-N16R8, 240 MHz
- 16 MB QIO flash and 8 MB OPI PSRAM (`qio_opi`, `BOARD_HAS_PSRAM`)
- native Hardware CDC/JTAG-compatible USB mode and CDC at boot
- 115200 baud monitor
- custom 16 MB dual-OTA table with two 6 MiB application slots

Build from the repository root without producing or publishing any release artifact:

```sh
pio run -d frame -e alfred_v1_2
pio run -d frame -e frame_esp32
pio run -d frame -e alfred_v1_2 -t size
pio run -d frame -e frame_esp32 -t size
```

At runtime, the S3 boot log should report detected PSRAM. The build configuration enables OPI PSRAM, but physical detection remains an on-device validation item for the integrated firmware.

## Current port build report

GitHub Actions run `33909072657` at commit `85bc34f8a027cb83696ba2323ac16374d29692b3` established the first complete green build for this port: all 37 Python firmware tests passed, both `alfred_v1_2` and `frame_esp32` compiled, and the Alfred size target passed. The Alfred image used 1,471,377 of 6,291,456 application bytes (23.4%) and 120,624 of 327,680 bytes of static internal RAM (36.8%). Runtime detection of the configured 8 MiB OPI PSRAM remains a first-flash serial check.

The selected Alfred partition table is `partitions_alfred_16mb.csv`: app0 spans `0x010000..0x60ffff` and app1 spans `0x610000..0xc0ffff`, providing 6,291,456 bytes per OTA slot. No firmware binary or OTA manifest is changed or published by this hardware-port PR.

## Hardware/API port notes

Alfred uses an explicit S3 FSPI instance at 4 MHz, the MAX17048 rather than ADC35, and active-low BQ24074 status signals. Deep-sleep source-change wake uses the ESP32-S3-supported `esp_sleep_enable_ext1_wakeup` API on RTC-capable GPIO17. Display power is asserted only around panel operations and held LOW across deep sleep.

## Continuous compilation

The `Frame firmware build` GitHub Actions job installs pinned-project PlatformIO dependencies, runs the complete Python firmware test suite, compiles both hardware environments, and reports the Alfred size. It uploads and publishes nothing. This provides the required compile gate when local tooling is unavailable.

The Alfred environment resolves `boards/alfred_v1_2.json`, rather than inheriting the misleading N8/no-PSRAM DevKitC label. That manifest declares ESP32-S3-WROOM-1-N16R8, 16 MiB flash, 80 MHz QIO flash mode, `qio_opi` Arduino memory type, OPI PSRAM with an expected size of 8 MiB, and the USB CDC/JTAG build flags. PlatformIO 6.6.0 deliberately emits a DIO-compatible ROM image header for a `qio` board setting while selecting `bootloader_qio_80m.elf`; the selected QIO bootloader and `qio_opi` SDK configuration are visible in the verbose CI log. `platformio.ini` independently selects the checked-in `partitions_alfred_16mb.csv` table.
