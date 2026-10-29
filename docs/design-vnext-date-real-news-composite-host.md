# R4 Date + genuine News renderer on the original host GFX/BW chain

This test-only draft extends #1469 (Date-only multi-cell checks) to **two actual production module painters** on one original GFX/BW 800×480 frame. It does not edit production code, Surf, Date, News, or feature flags.

## What it really executes

- `frame/src/modules/ModuleDate.cpp` — original Date rendering with 3×4 editorial Date placement at (0,0,600,480), the real editorial admission gate, all original fonts and botanical/calendar glyphs.
- `frame/src/modules/ModuleNews.cpp` — original News header, text wrapping, complete-headline selection, bullet, font and list drawing with a 1×4 neighboring cell at (600,0,200,480).
- **Exact pinned Adafruit_GFX v1.12.6 and GxEPD2_BW v1.6.4** source code from the preceding host QA chain. The transport is a mock T7 sink, not a real screen. Original ArduinoJson v6.21.5 headers are fetched to compile the unmodified News source.
- News receives **three fixed synthetic test headlines** by initializing its existing `NewsCache` directly within the host executable (test harness only). The cache's loaded bit is set, so **no network request is made**; attempting to fetch would raise an error. This **does not** demonstrate real NRK JSON parsing, backend integration, live update scheduling, device authorization or network connectivity.

The harness renders four complete 48,000-byte pages per theme: Date-only, News-only, Date then News, and News then Date. **Light and dark themes** both use original `Theme` and 1-bit GFX draw behavior. It requires Date editorial admission, nonempty real News/Date ink, zero cross-cell pixels in individual passes, and the bit-identical equality of **(independently composited Date + News)** to each of the two original-driver draw orders. Full rendered bytes + SHA256 + PNG previews + JSON manifest are archived.

## Limits / approval gates

- This is a **real two-module C++ painter composition**, but **not `ModuleRenderer::renderPlaceholders` dispatcher**, actual Weather/Surf/Reminders, or a real live News feed. Only synthetic News headlines are provided. Other combinations remain open.
- The panel's actual visible matte is (58,39,680,436); pixels outside the matte on the actual 800×480 panel are *not visible*. The test guards module ownership but does not claim a physical image or 1–2 m readability.
- GxEPD2_750_T7 SPI/controller, waveforms, electrical connections, refresh timing, display photograph and original Layout Lab seed `347015390` artistic review remain open.
- The original known-good **v2.7.3 BIN and SHA** are still not verified for rollback.

**FLASH: NEI.** Stacked draft only; no merge, deployment, OTA, production firmware or Surf changes.
