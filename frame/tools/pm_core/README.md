# RE:MIND Alfred PM-enabled Arduino SDK

This directory exists to test the ESP32-S3 connected-idle power strategy with **real automatic light sleep** while keeping RE:MIND on Arduino-ESP32 2.0.14.

The stock Arduino-ESP32 2.0.14 package used by the current Arduino IDE workflow does not expose automatic light sleep because its precompiled ESP-IDF libraries were built without the required PM/tickless configuration. Alfred V1.2 hardware itself supports the feature.

## What changes

The official Espressif `esp32-arduino-lib-builder` `release/v4.4` branch is used to rebuild the ESP32-S3 SDK with:

```text
CONFIG_PM_ENABLE=y
CONFIG_FREERTOS_USE_TICKLESS_IDLE=y
CONFIG_FREERTOS_IDLE_TIME_BEFORE_SLEEP=3
CONFIG_FREERTOS_HZ=1000
```

Versions are pinned to:

- Arduino-ESP32 `2.0.14`
- ESP-IDF `v4.4.6` (`357290093430e41e7e3338227a61ef5162f2deed`)
- Target `esp32s3`

No production OTA image or manifest is published by this build.

## Build

From Linux/WSL:

```sh
bash frame/tools/pm_core/build_pm_core.sh
```

The build fails unless the generated ESP32-S3 `sdkconfig.h` actually contains both `CONFIG_PM_ENABLE=1` and `CONFIG_FREERTOS_USE_TICKLESS_IDLE=1`.

The output is:

```text
frame/tools/pm_core/dist/remind-arduino-esp32-2.0.14-esp32s3-pm-sdk.zip
```

CI also uploads this zip as the `remind-arduino-esp32-2.0.14-esp32s3-pm-sdk` workflow artifact.

## Windows Arduino IDE test install

Close Arduino IDE first. Download/extract the workflow artifact, then from PowerShell run:

```powershell
powershell -ExecutionPolicy Bypass -File .\install_pm_sdk_windows.ps1 -SdkZip .\remind-arduino-esp32-2.0.14-esp32s3-pm-sdk.zip
```

The installer verifies both PM macros in the replacement SDK and backs up the stock `esp32s3` SDK before replacing it.

Restart Arduino IDE afterward.

## Validation sequence

1. Compile/upload the existing V3 connected-light-sleep test.
2. Before unplugging USB, V3 **must** print:

   ```text
   Automatic light-sleep build support: YES
   ```

3. If it still prints `NO`, do not run a two-hour test.
4. Once V3 reports `YES`, rerun the V2 deep-sleep baseline using this same PM-enabled core.
5. Run V3 for two hours using the same core and compare V2 vs V3.
6. Only after the battery comparison, test responsiveness/ping behavior.

## Restoring the stock SDK

The Windows installer prints the backup directory it created next to `tools\sdk\esp32s3`. To restore, close Arduino IDE, remove the current `esp32s3` directory, and rename/copy the backup directory back to `esp32s3`.

Installing/updating Arduino-ESP32 from Boards Manager can also replace the modified SDK; this custom SDK is intentionally a controlled test setup, not yet the final distribution mechanism.
