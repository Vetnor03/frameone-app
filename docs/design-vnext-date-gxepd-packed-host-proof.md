# R4 Date: GxEPD2-compatible packed host frame (draft / no flash)

## Sources and fixed configuration
- Production alias: \`frame/src/display/DisplayType.h\` uses \`GxEPD2_BW<GxEPD2_750_T7,GxEPD2_750_T7::HEIGHT>\`.
- Production startup: \`DisplayCore.cpp\` calls \`display.setRotation(0)\`; full redraw uses \`setFullWindow(); firstPage(); ... nextPage()\`.
- Pinned firmware driver \`GxEPD2@1.6.4\`; actual \`GxEPD2_BW.h::drawPixel\` maps rotation=0, mirror=false, a full window and one page to \`i=x/8+y*(800/8)\`, MSB first \`(1<<(7-(x%8)))\`, and stores **1=white / 0=black**.
- Panel: \`GxEPD2_750_T7\`, native 800×480, full \`page_height=HEIGHT=480\`, **one 48,000-byte image buffer**. Its \`writeImage\` is given packed bytes and sends raster bytes in row-major order, subject to the panel's update protocol.
- Sources: [GxEPD2_BW.h v1.6.4](https://github.com/ZinggJM/GxEPD2/blob/1.6.4/src/GxEPD2_BW.h), [GxEPD2_750_T7 v1.6.4](https://github.com/ZinggJM/GxEPD2/blob/1.6.4/src/epd/GxEPD2_750_T7.cpp), [Adafruit_GFX v1.12.6](https://github.com/adafruit/Adafruit-GFX-Library/blob/1.12.6/Adafruit_GFX.cpp).

## Verification added (host-only)
\`CaptureFrameDisplay.h\` has **two simultaneous representations of actual unmodified \`ModuleDate::render()\` draw calls**: its original 384,000-byte-per-pixel framebuffer and a separate, GxEPD2-compatible 48,000-byte MSB-first packed buffer. Both update on each draw call.

- The host's binary pack implements the pinned driver's byte index/bit polarity at rotation 0, full 800×480 window.
- \`gxepd_packed_sentinels.cpp\` tests foreground/background reversals, x=0/7/8/799, transitions between scanlines and 48k capacity.
- \`generate_date_gxepd_packed_evidence.py\` runs the real C++ Date drawing entry point in the five native Date scenarios (light/dark, Oct, Dec–Jan, adjacent 3×4, holiday), generates packed \`.bin\` evidence, and **independently re-encodes the PGM's black/white pixels in Python**. Each of the 384,000 bits must match, and each file has a SHA-256, native packed FNV, admission state, bounds counters and a manifest. If differences appear, the process fails.
- \`frame/tests/test_date_gxepd_packed_evidence.py\` provides CI regression tests; the visual-review job uploads a separate *unflashed* evidence artifact containing the byte streams and \`manifest.json\`.

## Strict scope and limitations
This is **source-faithful GxEPD2-style data packing**, **NOT a GxEPD2 object's internal buffer capture**, nor a screenshot of e-paper, SPI capture, controller-memory readback, tested waveform, contrast, partial-refresh behavior, or physical 1–2 m readability. The host substitutes \`DisplayCore::get()\`; it does not instantiate or execute the full real driver. The test proves bit order, polarity, byte layout and consistency of a faithful mirror **given the host's C++ paint pixels**. It does not independently guarantee Adafruit GFX's runtime behavior matches every host primitive.

This work is strictly test-only: no changes under \`frame/src/\`, no Surf changes, no fonts, configuration, calendar/holidays or runtime feature flag changes. Existing default OFF and fail-closed Date rendering are unchanged.

**Original art reference:** \`RE-MIND-layout-review-100 (2).pdf\`, p1, seed \`347015390\`. Pixel packing does not certify composition/aesthetic equality to this reference; original image is more airy/one calendar than opt-in two-month proposal.

**FLASH: NEI.** Leave stacked drafts unmerged and deployment/OTA untouched. The original known-good v2.7.3 BIN and SHA remain to be verified independently before any physical test.
