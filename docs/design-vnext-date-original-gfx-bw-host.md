# Date original GFX → original GxEPD2 host integration (R4 QA)

**Scope:** New unmerged draft based on #1467. All changes are host-only QA, CI and documentation; **no changes under `frame/src/`, Surf, screen feature flags, fonts or runtime app.**

## Exact source-chain evidence

`generate_date_direct_gfx_bw_capture.py` verifies Git blob SHA-1 for exact upstream files from **Adafruit_GFX v1.12.6** (`Adafruit_GFX.cpp`, `Adafruit_GFX.h`, `glcdfont.c`, `gfxfont.h`) and upstream `GxEPD2_BW.h` from **GxEPD2 1.6.4**. It compiles those **unmodified sources** with original `ModuleDate.cpp`, actual editorial assets and rendering adapters. Host stubs supply only Arduino/Print plumbing and the fake T7 sink.

The direct C++ test executes **real `ModuleDate::render` → real `Adafruit_GFX` text, lines and circles → real `GxEPD2_BW::drawPixel` → its real 48,000-byte one-page buffer → real `nextPage` control path**, with a mock T7 transport collecting transferred bytes.

Five known Date cases cover light, dark, Oct, Dec/Jan, 3×4 neighboring placement, and an upcoming holiday. The host strictly checks editorial admission, transfer size, text/botanical/calendar ink, cell and matte bounds, and full/again/power-down transfer operations. For every case, **the original GFX+BW output is compared bitwise to the previous host GFX-like model**. Exact bit mismatch counts and bounding rectangles are **reported as QA findings, not silently declared equivalent**. Raw 48k output from both render paths plus SHA-256 hashes and `manifest.json` are uploaded.

**Important:** A green job means the original driver path executed, the original Date painter was admitted, and all output stayed within safety bounds. It **does not** inherently mean zero differences against the earlier simulator, aesthetic matching to Layout Lab p1 seed `347015390`, or readability at 1–2 m. Actual e-paper controller, real T7 waveform, SPI transfers and physical hardware were **not** exercised.

## Required approval barriers

The actual pinned `GxEPD2_750_T7` transport, SPI, panel, refresh, and daylight/indoor physical evaluation remain outside this host proof. Continue to keep all stacked drafts unmerged. The original **v2.7.3 working BIN + SHA** must be located and independently verified **before** any physical test.

**FLASH: NEI.** No OTA, deployment, merge or flash.
