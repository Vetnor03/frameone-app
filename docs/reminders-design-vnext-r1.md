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


## R3 — edge-case editorial preview and native source QA (11 November 2026)

R3 extends the **existing isolated preview**. It does not redesign locked
modules, change the app's data contract, or alter any date/Skip rules.

### Actual code changes
- Successfully loaded **empty** cache now has a measured, quiet editorial
  "No reminders" / "Nothing upcoming" state using original Fraunces48 /
  DM Sans bitmap glyphs, centered within the resolved cell. Fetch failures
  deliberately retain the unchanged legacy "Fetch failed" state.
- **Future-only** and **overdue-only** groups now use the existing production
  \`findPrimaryBucketIndex()\` and \`buildAdaptiveFallbackHeading()\`. Tomorrow
  and Today retain their literal labels, rather than incorrectly becoming
  "On Thursday" / "On Wednesday" from the future date builder.
- Dynamic heading buffers belong to the heap-backed plan and remain valid
  through native GFX painting; no temporary string lifetime dependency.
- If both Today and Tomorrow are present, the existing preference remains
  Today then Tomorrow, with later data counted in \`+N more\`. No API, source
  sorting or configuration changes.
- In a constrained cell, real original **DM Sans24/18** is preferred whenever
  one complete row fits. FreeSans9 is fallback-only, not allowed to replace
  readable original type merely to cram in more tiny rows.
- Failed preflight, impossible unbreakable titles and unavailable cache still
  keep the entire original production renderer. No silently shortened words.

### Original C++ one-bit verification
The native harness compiles the **same R3 C++ preview header** and original
GFX font bitmap arrays as firmware, using a portable shim for the original
renderer dependencies (the shim is not the full production runtime). It
writes original P4 1-bit PBMs plus 1:1 PNGs, not browser/HTML/SVG illustrations.

Native scenarios, each across all **16 geometries × Light/Dark**:
\`normal\`, \`long\`, \`many\`, \`tomorrow\`, \`norwegian\`, \`future\`,
\`overdue\`, \`distant\`, \`mixed\`, \`unbreakable\`, \`empty\`, \`unavailable\`.

Native QA checks also:
- No framebuffer clipping; no row rectangles crossing/overlapping sections.
- For each rendered row, reconstructing full wrapped lines equals exactly
  the original pre-normalized title; no lost facts or unexpected ellipses.
- \`shown+overflow=cache count\` whenever a nonempty preview is accepted.
- Headings retain exact Today/Tomorrow or truthful existing future/late dates.
- Reference cases normal, future, overdue, distant, mixed and empty produce
  full-size native previews in all 16 shapes and both themes.
- Failures are explicit; empty/unavailable are semantically different.

At the pre-final R3 build, **330/384** scenes rendered with no out-of-bounds
pixels. The 54 fallback cases were the 32 deliberately failed fetches,
14 exceptionally long unbreakable-word shapes and eight 1×1 long/dense/
Norwegian/Tomorrow-only cases with no space for a full item. Native fallback
status is **not** proof that the entire unchanged legacy renderer has been
captured as a native image.

### Remaining approval gates
- Inspect the final 12-scenario contact sheets on a full-size monitor and
  confirm real-room readability at 1–2 m in both Light and Dark.
- Fallback scenes require separate original-production renderer regression QA;
  the native header harness alone does not render the legacy path.
- End-to-end physical V4 test of 16 geometries after explicit owner approval;
  **never flash or OTA automatically**.
- R3 does not remove the previously existing firmware API limit of **10**
  reminder entries. The app's up-to-20 behavior remains unchanged.

**Date, Weather and Surf are file-for-file untouched. R3 remains draft,
unmerged, physically untested and not approved for production.**


## R3.1 — information hierarchy correction (11 November 2026)

Owner review flagged a crucial failure of the design contract: in R3 the
Today/Tomorrow label was readable from across the room while the actual
reminder text could require reading glasses. This is **not acceptable** for
the physical 1–2 m target even if a native renderer passes CI.

**Locked hierarchy for Reminders previews (not yet physically approved):**
1. PRIMARY: exact reminder **task title** — largest usable GFX bitmap glyphs;
   on roomy cells, the first reminder can use original Fraunces48, with
   following complete tasks in original DM Sans24.
2. IMPORTANT: full time if one exists, original DM Sans18, with a
   side-by-side or stacked caption according to true width.
3. SECONDARY: Today/Tomorrow, overdue or future date grouping, DM Sans18
   on regular/large cells. Tiny 1-cell labels may be 9pt because the day is
   context, never the hero.
4. OPTIONAL: accurate +N more, lower priority than a readable full task.

The native C++ plan tries **Fraunces48 first task + DM Sans24 following** for
roomy sections, then DM Sans24 for all. Only if no complete first task
fits does it try DM Sans18 / the old font. It no longer switches every item
to 18px just to squeeze in one or two more reminders. An impossible title
goes to the unchanged legacy path rather than being silently cut.

A shallow strip now reserves at most about 110px for the small day label,
instead of dedicating a quarter of the cell to the word "Today". Header
typography and task typography are independently measurable in original GFX
pixel bounds. This is ONE pixel-driven hierarchy, not 16 hardcoded designs.

Verified in actual native one-bit 1×1, 2×2, 4×1, 4×4 and dense 4×4:
the date no longer dominates the composition; the first task is visibly
larger and following task rows remain readable. Native CI asserts secondary
date fonts, original primary task fonts for roomy normal cells, exact
title preservation, correct overflow accounting, no row intersections and
zero pixels drawn beyond the native framebuffer.

**This remains a digital design candidate**. 1–2m readability on the real
V4 is not established until explicit physical QA. Do not merge or flash
without the owner's separate permission. Date/Weather/Surf remain frozen.
