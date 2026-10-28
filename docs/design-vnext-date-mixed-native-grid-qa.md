# R4 Date — mixed-layout real firmware grid acceptance (DRAFT, unflashed)

**Date:** 28 October 2026. **Stack:** #1461 → this draft.

The original source-GFX gallery showed a single Date against the physical matte, but did not exercise its place beside Weather, Reminders, Surf, News, Groceries, Stock or empty placeholders in an actual firmware grid. The firmware's layout origin is **0,0 on the 800×480 panel**, with **200×120 grid units**; the passepartout only reveals `x=58,y=39,w=680,h=436`. An acceptance check must keep these dimensions separate.

## Evidence added

- 11 deterministic source-ink comparison cases: all four named layouts, various custom partitions, a custom 3×4 Date beside Weather/Surf, repeated Date modules, blank cells, holiday replacement of art, December→January rollover and inverted black/white contrast.
- For every Date **candidate admitted by the existing experimental JS planner**, reserve and bound-check ALL actual source roles, 2 month-calendar regions, optional native-sourced botanical/rule and future holiday text against **its own physical cell**, the **matte**, and **every neighboring cell**. A failure stops report generation.
- Every legal **100 position/shape combination** is separately tested using the real 200×120 grid units and surrounding non-Date 1×1 cells, two month fixtures (200 cases), plus the existing **C++11 native `DateEditorialDualCalendar.h` geometry** vs JS parity for the same grid positions. Any non-fitting Date uses original legacy fallback; no false promise of rendering it.
- The HTML gallery deliberately labels every other module **NOT RENDERED**, and every Date fallback **NOT CAPTURED**. It never imports Surf or changes its rendering. Source original-F1 fonts, actual measured rectangles and original native botanical coordinates are used only for Date candidates.
- New stand-alone artifact: `date-vnext-mixed-layout-ink-study-unflashed` in existing non-deploying visual-review job.

## Boundaries not yet crossed

**This is a source-ink geometry/raster study, not a true native GxEPD2 framebuffer.** Date role/calendar preflight has independent stricter C++ checks and may reject JS-accepted source studies. We have **not** verified other modules' actual bitmaps, actual partial-window clipping, full-mixed composition pixels, physical Light/Dark contrast or reading at 1–2m. Next meaningful evidence needs an instrumented native painter capture under a separate explicit test flag, without shipping to pilot or production.

The original `RE-MIND-layout-review-100 (2).pdf` p1, seed `347015390` remains the design comparator, not a new visual reset. The original v2.7.3 rollback binary and cryptographic hash remain unverified. No code is merged/deployed. Surf is untouched.

**FLASH: NEI.**
