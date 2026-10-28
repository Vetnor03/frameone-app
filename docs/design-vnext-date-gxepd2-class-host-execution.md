# RE Design vNext — upstream GxEPD2_BW host execution (R4 draft)

## What runs

The CI harness fetches the **unmodified upstream `GxEPD2_BW.h` v1.6.4** from `ZinggJM/GxEPD2`, verifies Git blob SHA-1 `10140475964878a5249506005e31dee8a93ac078` (identifies the file bytes), and compiles the real templated class with g++11. No upstream file is patched.

Firmware's actual `ModuleDate.cpp` first paints each of the five established native 800×480 Date fixtures into the existing host pixel buffer. A second isolated host executable instantiates **`GxEPD2_BW<Mock750T7,480>`**, calls `setRotation(0)`, `setFullWindow()`, `firstPage()`, **all 384,000 `drawPixel()` calls**, then `nextPage()`. The mock T7 transport receives the driver's **actual internal 48,000-byte framebuffer bytes** through `writeImageForFullRefresh()`; the mock records `refresh(false)`, repeated write, and power-off. Bytes are compared to the **independently re-packed PGM** and previous 48k host oracle. All bytes must match; any divergence fails CI. Raw transmitted host bytes plus hashes and evidence metadata are uploaded for inspection.

## Why this is stronger

This **does execute** upstream `GxEPD2_BW`'s real buffer allocation, indexing, bit polarity, full-window page loop, and transfer-call sequence — rather than copying its algorithm into a host stand-in.

## Still explicitly NOT proven

- The `Adafruit_GFX` base is a **minimal test shim** for dimensions/rotation; **no actual Adafruit_GFX text/shape primitives** are executed in the second process. The original Date C++ glyph paints were captured earlier by the existing host rasterizer.
- The underlying `GxEPD2_750_T7` panel class is replaced by `Mock750T7`. This does **not** execute real SPI transfer routines, controller-memory writes, timing, partial-refresh waveform, battery/power sequencing, or physical panel behavior.
- There is no assertion that displayed output is photographically identical or legible from 1–2m. The original `RE-MIND-layout-review-100 (2).pdf`, page 1, seed `347015390`, remains an aesthetic reference, not proof of an exact match.
- Driver host test is independent of production firmware; nothing under `frame/src/`, no fonts, Surf, runtime flags, dates, week numbers, holidays or UX is changed.

**FLASH: NEI.** No merge, deploy or OTA. Original known-good v2.7.3 BIN and SHA must be verified before later physical testing. The above is a host driver integration proof, *not* physical approval.
