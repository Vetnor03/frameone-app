# R4 Date — native grid sweep & GxEPD2 row/page packing model

Date: 28 October 2026. Stacked draft on #1463, **UNFLASHED**.

## Why this step

The previous native C++ host capture in #1463 found and fixed the real 19px ISO-week glyph / 18px reserved-inner-gutter mismatch. Five native examples then succeeded. That is not enough to prove other supported Date cell sizes, positions or e-paper byte ordering.

## Exact tests

1. Use **unchanged compiled original `ModuleDate::render`** with original Fraunces/DM Sans and FreeSans GFX assets for **every one of 100 legal 4×4-grid cells** on the actual 800×480 firmware coordinates, twice for October/December 2026 and twice for Light/Dark: **400 native calls**. This is NOT an emulated JS layout planner.
2. The host test runner gets its `Cell` fields from the real grid position, including gridCol/gridRow/colSpan/rowSpan and named-layout size classifications, rather than supplying 4×4 metadata for every test call.
3. The host-only C++ capture accepts a special output filename `-` to avoid writing 400 large image files. It still runs both native painting passes, the actual fail-closed admission test, pixel comparisons and zero-out-of-cell/matte assertions. Native-rejected candidates remain **LEGACY FALLBACK**. The matrix explicitly reports admission/fallback counts by all 16 available sizes.
4. Source-guided, **independently tested packing model** of `GxEPD2_BW` at production rotation 0: 800×480, black/ink **0**, white/paper **1**, MSB-first bit order, 100 bytes per full row, 8-pixel aligned horizontal partial windows, and split/reassembly in 16-, 64-, 480-row pages. The actual native Light/Dark captured PNG/PGM bits must roundtrip into exactly 48,000 transport-style bytes in all three page modes.
5. GitHub Actions nonflashing visual-review job generates an HTML report, `date-vnext-native-grid-matrix-unflashed`, with complete per-cell native admission results and a shape summary. It cannot replace the real physical screenshot or a hardware scope trace.

## Key limitations

The packing model is aligned with the public `GxEPD2_BW` source code and the firmware configuration (`GxEPD2_750_T7`, `setRotation(0)`, `firstPage/nextPage`) but **does not execute the actual library on ESP32** or instrument the display controller. This must **never** be labelled a captured GxEPD2 framebuffer, transmitted SPI bytes, waveform, or proof of readability at 1–2m. Adafruit_GFX-like host rasterization still differs from the physical e-paper's ink behavior.

The report paints Date **only**, never simulates another module's real pixel contents or changes Surf. Standard firmware still compiles out the experiment. The original `RE-MIND-layout-review-100 (2).pdf` p1 (seed 347015390) remains the aesthetics baseline.

**Missing physical gate:** known-good original v2.7.3 firmware `.bin` and SHA256 independently verified; then specifically authorized experimental flash and physical Light/Dark viewing/ESP32 GxEPD2 page bytes. Do not infer approval from this report.

**FLASH: NEI. No merge/deploy/OTA.**

## Critical finding: real full 4×4 was incorrectly disallowed

The first **truthfully classified** matrix showed 24/400 native-admitted cases (3×3 and 3×4) but **0/4 at 4×4**. The former five-case host capture had wrongly constructed `Cell{...,CELL_ADAPTIVE}` for all cases, including full-screen, even though actual `Layout::cellSizeForGeometry(4,4)` returns `CELL_XL`. The experimental painter rejected anything whose `cell.size != CELL_ADAPTIVE` before any measured preflight. Thus the owner’s original full-screen target was silently impossible despite the promising gallery.

This draft corrects both sides: the host CLI populates the **real** Cell metadata for all shapes; the experimental painter removes the cell-size-name gate and relies instead on its existing strict complete native F2/calendar/bitmap/holiday/ring preflight. Valid XL editorial is no longer arbitrarily rejected. Every legacy, nonadmitted cell continues to draw its original layout; the experimental feature remains compile-time OFF by default. The new regression test **requires all four full-screen 4×4 Oct/Dec Light/Dark cases to be natively admitted**, not just any convenient custom cell. This is a Date-only runtime change: no Surf changes.
