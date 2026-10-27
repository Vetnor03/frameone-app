# Date vNext R3 — original GFX pixel bitmap visual review (draft #1449)

This is the first **viewable 800×480 gallery** for the new Date design. It is an independently generated **HTML** report, uploaded to GitHub Actions artifacts for this draft (download from the run's Artifacts section). It does not deploy to the app, render on the actual e-paper panel, modify Supabase, change firmware binaries or flash an ALFRED device.

## What is rendered
- **Original Screen-6 Fraunces72/48 + DM24/18 raw GFX 1-bit bitmap pixels** are decoded from the unchanged F1 `RemindEditorialFonts.cpp` source. There is no CSS substitute font or letter-width estimate.
- Legacy `FreeSans9ptNO` and `FreeSansBold12ptNO` actual bitmap pixels are used for calendar dates, week labels and title in a *source-guided simulation* of existing `drawMonthCalendar`. It includes displayed current-day rings and sample holiday dots where date labels match the supplied sample data.
- `planDateWithRealGfx` + `planDateDisclosure` are the **already-tested JS measurement and context planners**, not new visual templates. Each sample shows the whole 800×480 pixel panel with the matte clipping region (x58, y39, width680, height436), proposed glyph outlines, and candidate context rectangles.
- **116 deterministic examples**: one case for every one of the **16 grid cell shapes**, plus each of the **100 legal shape/position combinations** once. Scenarios include current day, long December month with January rollover, long September, and holiday entries. HTML filters let reviewers isolate a shape, review size vs position cases, hide geometry guides, or invert grayscale.
- Disabled production use: only new `frame/tools/generate_date_review_gallery.py`, test-only Node bulk planner adapter, native test, workflow artifact step and these docs. No Surf files or production renderer changes.

## What this does NOT prove
The calendar is reconstructed from source math but is **not an actual GxEPD2 captured framebuffer**; differences in legacy glyph clipping, ink/current-day highlight, theme, or holiday markers must be checked on the real display. A JS geometry candidate may fail the stricter C++ all-facts/calendar preflight (noted explicitly in every report). The dark invert preview is not an e-ink waveform comparison. This report does not simulate actual weather/reminder/other module pixels, so mixed-module interaction QA remains a separate later gate. Typography must still be viewed at 1–2 metres physically; user approval is required, not inferred.

No physical flash until v2.7.3 known-good exact binary + SHA can be recovered and rollback/QA gate passed. Original fonts remain under the unchanged OFL license notices.

**FLASH: NEI.**
