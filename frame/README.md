# Frame firmware overview

## What this firmware does

This firmware runs an ESP32-based e-paper smart frame that:

- Boots from deep sleep, connects to Wi-Fi, and keeps time synced to Oslo time.
- Ensures the device is paired with the backend (device ID + token flow).
- Fetches frame layout/configuration and module data from backend APIs.
- Renders dashboard content on a 7.5" e-paper display using configurable layouts/themes.
- Reports wake/battery/power status to the backend.
- Uses change detection (config/data/power/periodic/firmware) to decide whether to redraw.
- Returns to deep sleep with timer + power-sense wake sources.

The main entrypoint is `frame/src/frame_v2.4.7.ino`.

## Firmware architecture

```text
frame/src/
├── frame_v2.4.7.ino      # Boot + runtime orchestration
├── core/                 # Shared config, parsed frame config, layout/theme primitives
├── device/               # Device identity, Wi-Fi creds/provisioning, time sync, battery logic
├── display/              # E-paper driver wrapper + pairing/setup screens
├── network/              # HTTP client, pairing API, change tracking, OTA updater
├── modules/              # Module renderers + per-module fetch/cache logic
├── assets/               # Icons and custom fonts used by modules
└── utils/                # (currently empty in this codebase)
```

## Folder responsibilities

### `core`

- `Config.*`: backend base URL, display frame bounds, and e-paper control pins.
- `FrameConfig.*`: fetches `/api/device/frame-config` and parses layout/theme/cells + module settings (`date`, `weather`, `surf`, `soccer`, `surf_settings`).
- `Layout.*`: defines 4 layout types (`default`, `pyramid`, `square`, `full`), builds cells, draws dividers, and invokes module rendering.
- `Theme.*`: maps theme key (`light`/`dark`) to paper/ink colors.
- `Types.h`: shared structs (pair responses, cell geometry).

### `device`

- `DeviceIdentity.*`: persistent `device_id` generation (`frm_...` from EFuse MAC), token storage/clear in `Preferences` namespace `frame`.
- `WiFiManager.*`: persistent Wi-Fi credentials in `Preferences` namespace `wifi`; connects as STA.
- `ProvisioningPortal.*`: AP + DNS captive portal + web form to save Wi-Fi creds, then restart.
- `TimeSync.*`: NTP setup and TZ (`CET-1CEST...`) with validity check.
- `BatteryManager.*`: ADC-based battery voltage sampling/smoothing, charging-state inference, learned full-voltage calibration, and display-percent stabilization.

### `display`

- `DisplayType.h`: aliases display type as `GxEPD2_750_T7` (7.5" panel class).
- `DisplayCore.*`: global display object, refresh strategy (full vs partial), frame drawing helpers, battery overlay rendering.
- `ScreenPairing.*`: pairing/setup/error screens shown on e-paper.

### `network`

- `NetClient.*`: HTTPS/HTTP GET/POST helper with retries and bearer token header support.
- `BackendApi.*`: pairing endpoints (`pair/start`, `pair/status`).
- `UpdateChecker.*`: persisted signatures/counters to decide redraws (config meta, reminders hash, surf signatures, wake counter, firmware version, USB/battery deltas).
- `FirmwareUpdater.*`: firmware manifest check + OTA install via `Update`.

### `modules`

- `ModuleRenderer.*`: dispatches slot assignment strings to specific module renderers.
- Implemented modules: `date`, `weather[:id]`, `surf[:id]`, `reminders`, `countdown`, `soccer[:id]`.
- Most modules fetch data on-demand with per-instance caches and `refreshMs` checks.

### `assets`

- `assets/fonts/`: custom Norwegian-friendly font variants used by modules.
- `assets/icons/`: icon drawing primitives used by weather/surf modules.

### `utils`

- Present in directory structure, but no files currently exist under `frame/src/utils/`.

## High-level boot/runtime flow

1. Initialize serial, log wake reason, init identity/Wi-Fi/checker/battery managers.
2. Read power-sense pin early (USB presence inference).
3. First-boot shelf behavior: if no Wi-Fi creds and no token and not marked done, show shelf screen and deep-sleep until power-sense wake (battery-only case).
4. Increment wake counter.
5. Connect saved Wi-Fi; if that fails, run captive provisioning portal (blocking, reboot after save).
6. Sync time (`TimeSync::ensure`).
7. Ensure pairing/token (`ensurePairedNoReboot`).
8. Read battery state and update display battery status state.
9. Run OTA check only if local time/day policy says due (after 02:00 local, once per day).
10. Determine redraw need from:
   - firmware version mismatch,
   - periodic wake threshold,
   - config meta change,
   - reminders signature change,
   - surf signature change,
   - USB state change,
   - battery jump >= 10%.
11. If no redraw: post device status, persist wake metadata, sleep.
12. If redraw: fetch frame config, apply module config pointers, draw layout+modules, post status, persist signatures/version/metadata, sleep.

## Pairing flow (actual implementation)

- Device identity is stable (`device_id`) and generated once if missing.
- If token exists in flash (`Preferences` `frame/token`), pairing is considered complete.
- Otherwise, firmware:
  1. Polls `/api/device/pair/status?device_id=...` a few times quickly.
  2. If still unpaired, calls `/api/device/pair/start?device_id=...` to obtain `pair_code` and expiration.
  3. Shows pair code on e-paper with app URL `https://re-mind.no/login`.
  4. Polls pair status until timeout; stores `device_token` when present.
- If token is later invalidated (401/403 during authenticated flows), token is cleared and pairing recovery is attempted.

## Config + module data fetching

- Frame configuration: `/api/device/frame-config?device_id=...` (Bearer token).
  - Parses `settings_json.theme`, `settings_json.layout`, `settings_json.cells`, and `settings_json.modules.*`.
- Change probe before render:
  - `/api/device/config-meta` (`updated_at` compare).
  - `/api/device/reminders` hashed signature compare.
  - `/api/device/surf-meta` signature compare per configured surf instance.
- Module runtime data sources:
  - Weather: `https://api.open-meteo.com/v1/forecast?...`.
  - Surf: `/api/surf/score?...`.
  - Reminders: `/api/device/reminders?...`.
  - Countdown: `/api/device/countdowns?...`.
  - Soccer: `/api/soccer/frame?teamId=...`.

## OTA/update flow (actual implementation)

There are **two update-related mechanisms** in code:

1. **Redraw-for-firmware-version** (`UpdateChecker`):
   - Compares stored `fw_ver` to `FW_VER` string (`v2.4.7`) to force one redraw after new firmware runs.

2. **Firmware binary OTA** (`FirmwareUpdater`):
   - Daily-gated by main sketch (`after 02:00`, once per day via `ota_day`).
   - Checks manifest at `/api/device/firmware?device_id=...&current_version=...`.
   - If `update_available` and version is newer, downloads `url` and flashes via `Update`.
   - Reboots on success.

## Battery/charging/power handling

- Battery voltage sampled from ADC pin **GPIO35** using trimmed-mean samples + EMA smoothing.
- Displayed percent derived from voltage curve between `DISPLAY_EMPTY_V=3.35V` and learned full voltage.
- Learned full-voltage calibration is persisted in `Preferences` namespace `battery` and updated after valid USB charging sessions.
- Charging state inferred from smoothed-voltage slope scoring, not from a dedicated charger IC pin.
- USB/power presence inferred from **GPIO39** (`PWR_SENSE_DEBUG_PIN`):
  - HIGH => USB present,
  - LOW => battery only (per in-code comments/logging assumptions).
- Deep sleep wake sources:
  - timer wake (5 min when USB present, 15 min otherwise),
  - EXT1 wake on power-sense edge direction depending on current power source.

## Current module list in this codebase

- `date`
- `weather` (supports `weather:<id>`)
- `surf` (supports `surf:<id>`)
- `reminders`
- `countdown`
- `soccer` (supports `soccer:<id>`)

## Working on this firmware

- Start changes from `frame_v2.4.7.ino` flow first; most regressions come from sleep/pairing/redraw decisions.
- Keep token-loss behavior intact: several auth failures intentionally clear token and trigger re-pair.
- Preserve low-memory patterns (static/global config/cache usage, bounded `StaticJsonDocument` sizes, array caps).
- Validate any power changes against deep-sleep wake behavior (`EXT1` + timer).
- If adding modules, wire all parts together:
  1. parser fields in `FrameConfig`,
  2. module dispatch in `ModuleRenderer`,
  3. refresh/signature behavior in `UpdateChecker` if needed,
  4. render/layout expectations for all cell sizes.
- For production hardening, TLS currently uses `setInsecure()` in networking/OTA and may need certificate pinning/CA strategy.

## Notes on uncertainty

- The code clearly targets an ESP32 + `GxEPD2_750_T7` display class, but exact physical board SKU and final wiring outside the named pins are not declared.
- Backend API contract details beyond fields directly parsed in code are not documented here.
