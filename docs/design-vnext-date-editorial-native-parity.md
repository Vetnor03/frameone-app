# R3/R4: native editorial Date geometry parity with audited Layout Lab

**Stack:** #1440–#1451 → this PR #1452. Pure geometry experiment. No new rendering path, no frame flash.

## Implemented
- `frame/src/display/DateEditorialPlan.h` adds a pure C++11 implementation of the **entire editorial date+calendar layout decision**, rather than the earlier smaller centered three-fact Date layout. Inputs contain already measured original Fraunces72/48, DM24/18, year and weekday integer GFX ink rectangles plus actual physical tile coordinates and factual Gregorian day/year/month.
- The same measurable 680×436 matte clip, inset, adaptive possible left/right column divisions, factual hierarchy and calendar/DOW/title thresholds are applied in C++ and JS. The planner tests 2 day fonts × 2 month fonts × 3 optional-art/rule combinations × 5 width splits and chooses one whole, nonoverlapping measured plan. Full content outranks optional art. Calendar and date are co-planned. No grid shape ID branch.
- Gregorian validity is checked by `DateMonthGridPlan::days`; any registered holidays currently **fail closed** to legacy Date rather than disappearing. No fabricated calendar content.
- `app/lib/dateEditorialComposition.mjs` uses exact percentage integers for the five candidate widths (40, 44, 48, 52, 56 percent of available safe width). This removes possible JS floating rounding ambiguity in parity without adopting a 4×4-specific layout.
- GNU++11 native CLI + Node original F1 measurement helper and regression tests compare the full geometry, selected typography variants, optional ornament flags, calendar feature flags, scores and matte-clipped boxes across all 100 legal grid placements × 10 date/invalid/holiday/Norwegian scenarios × Light/Dark, plus intermediate heights; 2,000+ inputs. Includes original full-screen 21 October PDF benchmark.

## Deliberate limits
- **Not a native GFX text renderer yet**. The native planner receives already-measured glyph ink; the next F2 adapter must measure actual original GFX font pointers, produce line baseline/cursor, preflight calendar and holiday data, and only then atomically draw. F1/F2 existing measurements in earlier draft PRs are the source primitives, but this PR does not connect the editorial plan to `ModuleDate`.
- The artwork is still SVG proof of design, **not** a tested 1-bit e-paper sprite. No 2–3 curated frame-safe illustrations, no native dark/light/physical pixel output, no mixed-module QA, no full next-calendar/holiday editorial disclosure.
- No production Date, Surf, OTA, MQTT, Supabase, Vercel, pilot deployment or firmware behavior changed. Known-good ALFRED V4 v2.7.3 rollback binary/hash has not been recovered.

**FLASH: NEI.**
