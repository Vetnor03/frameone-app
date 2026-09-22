# RE:MIND production PM libraries

Alfred V1.2 production firmware uses the connected-idle power mode proven by the completed battery tests: persistent Wi-Fi, a 100-beacon listen interval, `WIFI_PS_MAX_MODEM`, and automatic CPU light sleep at 240 MHz max / 40 MHz min.

The stock precompiled Arduino libraries are not treated as proof that automatic light sleep is enabled. The production build rebuilds the ESP32-S3 libraries with the required ESP-IDF options.

Pinned production generation:

- Arduino-ESP32 3.3.11
- ESP-IDF 5.5.5 generation (commit `b774170f`)
- ESP32 Arduino lib-builder commit `6671d0bd65cdb9d4cc1001b759e8610de945a8d5` (reproducible build pin; not claimed as the historical battery-test builder commit)
- ESP32-S3
- QIO flash at 80 MHz + OPI PSRAM (`qio_opi`)
- `CONFIG_PM_ENABLE=y`
- `CONFIG_FREERTOS_USE_TICKLESS_IDLE=y`

Build from Linux/WSL:

```sh
bash frame/tools/production_pm/build_pm_libraries.sh
```

By default the verified S3 SDK is written to `.pm-production-dist/esp32s3`. The firmware CI builds the same libraries and injects that directory into the Arduino 3.3.11 S3 SDK path before compiling the real flat Alfred sketch.

This directory contains build inputs/scripts only. Generated SDK binaries are intentionally not committed to the repository.
