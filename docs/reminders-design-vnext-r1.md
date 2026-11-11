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
