# R3 Date editorial original-font F2 native preflight adapter

This isolated follow-up to #1452 implements **native text measurement and complete baseline preflight** for the measured 2-column Date+calendar layout.

- `DateEditorialF2Adapter.cpp` uses original F1 Fraunces72/48 + DM Sans24/18 pointers, the actual `EditorialText::measureLine` and `EditorialText::planLine`, and the proven pure C++ `DateEditorialPlan::plan` geometry.
- Given actual year, month0, day, complete UTF-8 month and weekday and a pixel cell rectangle, it first rejects unsupported strings before the current FrameText normalizer could silently skip them. Gregorian validity, matte bounds, calendar minimums, optional decorative zones and responsive width division are handled by the common planner. Holidays currently fail closed to legacy and are **not discarded**.
- It then preflights the original font, exact glyph ink, negative bearings, cursorX and baselineY for **all four** year/month/day/weekday facts. Output is valid only after every line passes. No drawing or state mutation; scratch buffers are caller owned, stack allocated.
- `frame/tests/test_date_editorial_f2_adapter.py` independently compiles the *unaltered* original 1-bit font C++ source, original F2 and FrameText C++, and this adapter on native GNU++11, then compares font selection, rectangle geometry and exact cursor/baselines against JS original GFX reference across **800 legal geometry × scenario cases and intermediate heights**.
- The adapter is **not imported into active ModuleDate**, and it does not modify Surf. No new Date-paint feature flag is set. This is a critical native/raster readiness step but is not a framebuffer capture or proof of e-paper output.

Still required: calendar/holiday year-end factual preflight and native calendar draw in the *same* chosen editorial geometry, curated 1-bit illustration strokes, theme contrast, physical 1–2 m visibility, mixed-module previews, and a known-good v2.7.3 rollback binary/hash before flash.

**FLASH: NEI.**
