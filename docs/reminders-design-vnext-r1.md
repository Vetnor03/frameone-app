# Reminders Design vNext — R1 source audit and isolated preview

Date: 2026-11-11. Parent: [#1429](https://github.com/Vetnor03/frameone-app/issues/1429).

## Verified baseline on main
- Device renderer: `frame/src/modules/ModuleReminders.cpp` (2,705 lines at R1 kickoff).
- Cache: `ReminderCache` with at most **10** items; URL includes `limit=10`.
  The application may support 20 reminders. This R1 does **not** raise the device
  cache, HTTP limit or JSON memory budgets, because it is a visual-only change.
- Display title variants: `compact`, `standard`, `spacious` from the device
  API. `applyProfileTitles()` selects them based on the cell geometry.
- Grouping: `buildBuckets()`, `findPrimaryBucketIndex()`,
  `findBucketByDaysUntil()`. Existing server/feed order is retained;
  R1 does not re-sort.
- Four legacy presets: `renderSmall`, `renderMedium`, `renderLarge`,
  `renderXL`; custom cells: `renderAdaptiveReminders`.
- Existing adaptive renderer: `remindersResponsive.mjs` and C++ share
  `shallow-horizontal`, `vertical-list`, `split-sections`. It uses FreeSans9
  item text and hardcoded 88px rows. It uses measured font bounds to wrap words.
- Both themes are represented by `Theme::ink()` rather than hardcoded colors.
- No changes are made to Skip, Today/Tomorrow decision-making, network, API,
  data synchronization, configured display profiles, or stored reminders.

## R1 implementation on an unmerged preview branch
- `RemindersEditorialPreview.h` is included **inside** the existing Reminders
  translation unit and guarded by `REMIND_REMINDERS_EDITORIAL_PREVIEW_ENABLED`.
  The branch enables preview by default; switching the macro to `0` restores
  the original rendering path. Production `main` remains unchanged.
- Reuses the physically approved original Fraunces 48 and DM Sans 24/18 bitmap
  assets; uses real `getTextBounds()` and the existing C++ word-wrapper.
  FreeSans9 remains a safety fallback for unfit long titles.
- Chooses composition from the physical cell rectangle: shallow panorama
  with a lateral heading, portrait/compact vertical list, and optional
  Today/Tomorrow split for roomy cells. No per-grid-shape hardcoding.
- First-fit complete reminders take precedence over showing additional rows.
  Visible overflow is disclosed with `+N more`. The original renderer remains
  available if R1 preflight cannot display the first complete item.
- Draws using real GFX calls and theme-derived ink, not CSS/SVG or scaled fonts.
  The preview plan is heap-allocated on first use to avoid both large stack frames
  and a static DRAM regression for the old ESP32 target; allocation failure
  falls back to the original renderer.
- The design is **experimental**, not physically approved or production locked.

## R1 limitations / next QA
- This is **not yet** a validated 16-size native bitmap matrix. The first
  preview is an implementation candidate, not a finished design.
- No native 1-bit rendered image artifact has been produced at R1.
  Do not substitute a browser mockup for this QA.
- Source-contract tests cover gate / fallback / original fonts and the 16
  mathematical rectangles. CI must additionally compile the **enabled** preview.
- R2: capture actual renderer 1-bit output for Light/Dark and title/clock/date
  scenarios, inspect first 4×1, 2×2, 4×2 and 4×4, then cover all 16 shapes.
- R3: check complete date groups (including future/overdue), sorted priority,
  empty/many lists, long unbreakable strings and ÆØÅ glyph fidelity.
- R4: prepare physical V4 display test only after review. **No flash/OTA/merge.**

## Freeze boundary
Changes in this branch must stay within Reminders source, Reminders-only tests,
and this audit document. Date, Weather, Surf, shared fonts, text engine, layout,
device networking, MQTT, battery, backend and API remain unchanged.


## R2 — measured optical composition (11 November 2026)

R2 follows actual R1 native one-bit review. The 4×4 R1 layout clustered all
items at the top of the panel and 1×1 previews often fell back because a large
headline consumed the only useful row. The correction remains completely
Reminders-local:

1. Measured type choices from existing Fraunces72/48, DM Sans24/18, FreeSans9.
   DM Sans is the text font; the Fraunces headline only receives space **after**
   a complete first reminder can fit. For a 1×1, the heading drops to DM Sans18.
2. Layouts derive from the resolved rectangle: centered panoramic headline +
   vertical events for shallow cells; a balanced vertical stack for other cells;
   measured side-by-side Today/Tomorrow on spacious wide cells; two stacked
   date groups on narrower tall cells. This is one content policy, not 16 sketches.
3. Preflight uses actual C++ font ink bounds, line advances and complete-word
   wrapping. Times are essential and remain present. An overflowing whole item
   is disclosed as `+N more`, never silently truncated.
4. Content is optically shifted within available safe bounds. Section headings
   stay aligned across two-column designs. The plan is heap-allocated lazily;
   memory failure retains the old untouched renderer.
5. Added native fixtures for Norwegian Latin-1 glyphs, all-day, Tomorrow-only,
   future-only and empty states. The future-only and empty source paths are
   intentionally passed to the unchanged legacy renderer in R2.

Digital evidence (original C++ renderer, bitmap font data, 1-bit PBM output):
- [Native Actions run](https://github.com/Vetnor03/frameone-app/actions/runs/43054385984):
  **PASS**, 152/224 candidate previews; zero pixels outside the framebuffer.
  In this intentionally broader suite, 32 empty and 32 future-only cases are
  **expected legacy fallback**. The other eight fallbacks are overfull 1×1
  combinations (long/many/Tomorrow-only/Norwegian) where full text did not fit.
  Normal samples now render on all 16 rectangles in both themes (32/32).
- Assertions also verify per-frame shown+overflow=cache count and that
  chosen native GFX row regions do not overlap or escape their section.
- Remaining critical work for R3: actual native raster for legacy fallbacks,
  complete future-date/overdue / empty-state editorial designs, additional
  data-profile variants, careful 16-size pixel QA on both themes and
  physical readability on real V4 before production sign-off.
- [Original date visual reference](../../docs/design-vnext-phase0-visual-contract.md)
  and the owner's `RE-MIND-layout-review-100 (2).pdf` page 1 remain visual
  references, not a source of borrowed Date rendering code.

**No physical V4 test, merge, OTA or flash authorized or performed.**
Date, Weather, Surf, shared fonts, network, device/API and backend are untouched.
