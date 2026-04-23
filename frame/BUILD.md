# Build/reference notes for `frame/` firmware

This document is intentionally based on what is verifiable from `frame/src/` code.

## Verified from code

### Platform/framework signals

- Firmware is Arduino-style for ESP32 (`.ino`, `Arduino.h`, `WiFi.h`, `Preferences.h`, `esp_sleep.h`).
- Display stack uses GxEPD2 and Adafruit GFX-style fonts.
- Main sketch file is `frame/src/frame_v2.4.7.ino`.
- Current firmware version constant in code: `FW_VER = "v2.4.7"`.

### Key dependencies detected from includes

#### Core/ESP32

- `Arduino.h`
- `WiFi.h`
- `Preferences.h`
- `HTTPClient.h`
- `WiFiClientSecure.h`
- `Update.h`
- `esp_sleep.h`
- `time.h` / `sys/time.h`

#### JSON

- `ArduinoJson.h`

#### Display / graphics

- `GxEPD2_BW.h`
- `GxEPD2_GFX.h`
- Built-in GFX fonts (`<Fonts/...7b.h>`)
- Project custom fonts (`frame/src/assets/fonts/*.h`)

#### Provisioning/captive portal

- `WebServer.h`
- `DNSServer.h`

### Display panel/type and related constants

- Display typedef: `GxEPD2_BW<GxEPD2_750_T7, GxEPD2_750_T7::HEIGHT>`.
- Display object is created once globally in `DisplayCore.cpp`.
- Visible frame area constants:
  - `FRAME_X = 58`
  - `FRAME_Y = 39`
  - `FRAME_W = 680`
  - `FRAME_H = 436`

### Pin mapping used in code

#### E-paper control pins (from `core/Config.h`)

- `EPAPER_CS   = GPIO5`
- `EPAPER_DC   = GPIO17`
- `EPAPER_RST  = GPIO16`
- `EPAPER_BUSY = GPIO4`

> Note: comments mention typical SPI bus pins (SCK=18, MOSI=23, MISO unused), but only control pins above are explicit constants.

#### Battery/power related pins

- Battery ADC pin: `BATTERY_ADC_PIN = GPIO35`.
- Power-sense / USB-presence pin: `PWR_SENSE_DEBUG_PIN = GPIO39` (default macro).

### Battery and power behavior (code-confirmed)

- Battery voltage uses ADC raw -> voltage conversion with divider ratio `2.0`.
- Battery percentage is voltage-derived with smoothing/hysteresis logic.
- Learned full-voltage calibration is stored in `Preferences` namespace `battery` (`full_v`, `full_n`).
- USB presence is read from GPIO39 and used for:
  - deciding sleep interval (USB: 5 min, battery: 15 min),
  - selecting EXT1 wake polarity for plug/unplug transitions.

### Wi-Fi provisioning / captive portal

- If saved STA connect fails, firmware starts AP provisioning portal (blocking):
  - AP SSID pattern: `Frame-Setup-XXXX` (from MAC suffix).
  - DNS catch-all via `DNSServer` for captive behavior.
  - HTTP server on port 80 serves form and saves credentials to `Preferences` namespace `wifi`.
  - Device restarts after credential save.

### OTA/update dependencies and behavior

- OTA binary update stack uses:
  - `HTTPClient`
  - `WiFiClientSecure`
  - `Update`
  - `ArduinoJson` (manifest parsing)
- Manifest endpoint used: `/api/device/firmware?device_id=...&current_version=...`.
- OTA currently accepts insecure TLS (`setInsecure()`).
- Update install expects valid `Content-Length` and enough free sketch space.

### Backend/API assumptions visible in code

- Base URL default: `https://re-mind.no`.
- Device identity/token stored in `Preferences` namespace `frame`.
- Authenticated endpoints rely on Bearer token and clear token on `401/403` in several paths.

### Module/data-source endpoints referenced

- Pairing: `/api/device/pair/start`, `/api/device/pair/status`
- Config: `/api/device/frame-config`, `/api/device/config-meta`
- Status heartbeat: `/api/device/status`
- Reminders: `/api/device/reminders`
- Countdowns: `/api/device/countdowns`
- Surf: `/api/surf/score`, `/api/device/surf-meta`
- Soccer: `/api/soccer/frame`
- Weather: `https://api.open-meteo.com/v1/forecast`

### Fonts/assets dependencies

- Custom local fonts under `frame/src/assets/fonts/` are used by weather/surf/reminders/countdown/soccer modules.
- Icon helper under `frame/src/assets/icons/ModuleIcons.*` is used by weather/surf modules.

### Compile/build assumptions inferred from structure

- Include paths must make subfolders available by short include names (`"Config.h"`, `"DisplayCore.h"`, etc.) even though files live in nested folders.
- Build must compile all `.cpp` files under `frame/src/` and the `.ino` entrypoint.
- Sufficient partition/free sketch space is required for OTA write of downloaded binary.

## Needs manual confirmation

- Exact ESP32 board definition/package target (e.g., WROOM dev board vs custom board) is not declared in source.
- Arduino core version and exact library versions (`GxEPD2`, `ArduinoJson`, etc.) are not pinned in visible files.
- Partition scheme used for OTA (required for robust update sizing) is not present in `frame/` source tree.
- Final hardware wiring for SPI bus lines (SCK/MOSI/MISO) and any level shifting is not fully specified in code.
- Whether GPIO39 power-sense polarity matches all hardware revisions should be verified on device.
- TLS trust model is currently insecure in code; production certificate strategy is not defined here.
- No build-system manifest (e.g., `platformio.ini`, `arduino-cli.yaml`, board JSON) was provided in this task scope, so exact build command cannot be verified from `frame/src/` alone.
