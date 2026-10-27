# RE:MIND Design vNext — element-first layout contract (27 Oct 2026)

**Status: architecture correction, documentary proposal for review. Not approved runtime policy / not a firmware change.** This is the next gate for [#1429](https://github.com/Vetnor03/frameone-app/issues/1429) and [#1435](https://github.com/Vetnor03/frameone-app/issues/1435), *replacing the plan to extend F3/R2A by adding one bespoke renderer per cell size*. Original F1/F2 font assets and ink-measurement infrastructure may still be reused.

## Decision

**ONE element taxonomy + ONE responsive composition engine + module-owned content semantics**, not sixteen designs for the sixteen valid colSpan × rowSpan shapes. An independently drawn 1×1, 1×2, 2×1, etc. is an automatic **test case**, not a separate production code path. No `if (colSpan == X && rowSpan == Y) drawDateVersionX()` for Date. The only exception under this work is **Surf**, which is frozen and *excluded* from design migration.

The visual source of design direction is the already-reviewed Layout Lab and its actual decisions, not the hard-coded F3/1×1 preview prototypes. The experiments and values in draft [#1423](https://github.com/Vetnor03/frameone-app/pull/1423) are useful *candidate implementations*, **not automatically owner-approved final styling**: the draft also contains Surf code changes and cannot be merged as a whole.

### Sources to retain, not rewrite from memory

- **Lab shape/element/priority grammar:** `app/lib/editorialFrameLayout.mjs` and firmware draft `frame/src/display/EditorialDesign.h` on `feat/editorial-responsive-system` ([PR #1423](https://github.com/Vetnor03/frameone-app/pull/1423)): `compact/ribbon/column/card/spread`, roles `hero/heading/primary/secondary/listItem/measurement/figure/divider`, priorities `essential/important/optional/decorative`. Legacy font tokens (9/12/18 FreeSans) are **not** adopted as the final Fraunces/DM Sans design sizes.
- **Lab artwork/content-placement rules:** `app/lib/editorialComposition.mjs` (Date hero stack/ribbon/spread, content deduplication, measured-before-drawing conceptual model). Date ribbon is intended to read as **one coherent group**, not three disconnected distant columns; Date's decorative botanical illustration is subordinate to hero and calendar.
- **Existing production/Studio Date behavior:** `app/lib/dateResponsive.mjs`, `frame/src/modules/ModuleDate.cpp`; they contain thresholds, calendar and holiday logic and known differences for 1×1. Treat these as functional baselines, **not authority for F3 visual style**.
- **Global physical contract:** `docs/design-vnext-phase0-visual-contract.md` (PR #1431): true 800×480 panel, user-drawn 4×4 tiling preserved, viewport cropping, glyph bounds and priority-first overflow. Author-selected physical font test 6 = **Fraunces + DM Sans**; real font bitmaps in isolated F1 [#1432](https://github.com/Vetnor03/frameone-app/pull/1432), opt-in F2 GFX measuring [#1433](https://github.com/Vetnor03/frameone-app/pull/1433).
- **Hundreds of design previews:** the user-reviewed 100-PDF batches, 352 digital geometry/theme cases, deliberate Lab design discussions and subsequent approvals are references; **do not conflate automated pass/screenshot generation with human visual approval**. Recover the original reviewed seed/style notes before locking spacing and font sizes.

## Element policy — semantic facts independent of grid size

The engine sees a set of **elements** described by: `id, role, priority, source data, preferred font family/weight, allowed size range, layout affinities, disclosure policy, minimum readable fit`. This is a proposed architecture contract; it is not currently a machine-readable file implemented in production.

| Date element | Semantic role | Priority | Behavior as available visible area changes |
| --- | --- | --- | --- |
| Current day number (`27`) | HERO | **ESSENTIAL** | Always first; original Fraunces, largest **verified readable fitting** bitmap; controls visual hierarchy regardless of whether cell is narrow, shallow or full-width; no wrap or ellipsis |
| Weekday (`Tuesday`) | SECONDARY / identity | IMPORTANT | With hero where legible; one coherent group, horizontal in ribbon when measured to fit; below/alongside in column/card; omit *only* when space genuinely insufficient; never crop a date string |
| Month (`October`) | HEADING / context | IMPORTANT | Display when content and measured ink fit after HERO; visually subordinate, **not** a separate unrelated headline; do not force into 1×1 simply because its nominal height is 120px |
| Year (`2026`) | SECONDARY | OPTIONAL | Add only after date/weekday/month fit; never force primary font reduction to display year |
| Current month calendar | FUNCTIONAL GROUP | IMPORTANT when date module includes calendar | Offered when remaining area admits a useful readable grid **with minimum cell/tick dimensions**, not just because geometry equals 4×2; preserve today circle, week-number/header semantics where supported |
| Next month calendar | FUNCTIONAL GROUP | OPTIONAL | Only after current calendar and main date fit, with readability; no phantom/empty calendar |
| Holidays / upcoming date annotations | LIST_ITEM | OPTIONAL (may be elevated by module requirements) | Add after guaranteed day and important elements, only readable, keep real event/date order; no more rows than fit |
| Botanical/nature study illustration | FIGURE | DECORATIVE | **Only after** all needed factual elements, calendar and breathing room have reserved bounds. Consider in genuinely spacious leftover region; no static 4×4-only switch and no forced art in smaller regions. 1-bit crisp, theme-aware, no dense noisy reduction |
| Divider / ornament | DIVIDER | DECORATIVE | Use only when it improves grouping, within current tile, never across module edges |

All other modules can reuse the **same roles and general sizing policies**, but retain their own semantics. For News complete headlines; Reminders event priority/Today/Tomorrow/skip; Weather temperature as hero and real weather icon functional. **Surf remains an entirely excluded, frozen renderer.**

## Engine pipeline (source of truth)

1. **Module fact selection**: Decide facts independently from how they will look; preserve product/data rules and date/calendar semantics. Annotate each fact with **role and priority**, without assigning a 4×4 grid shape.
2. **Measure actual available area**: Use the current tile's (x,y,w,h), intersect with the physical matte/viewport region (currently source-observed x=58..737, y=39..474), apply the Lab-approved padding/spacing policy. For classification use actual region aspect/size; avoid shape enums derived *only* from grid labels.
3. **Choose composition grammar**: compact/ribbon/column/card/spread are **layout behaviors**, not sixteen templates. E.g. ribbon keeps facts together on a row; column stacks; card balances hero and context; spread can allocate a readable calendar or later art. The grammar may have a few measured threshold candidates, but not colSpan-specific appearance branches.
4. **Assign candidate typography from semantic tokens**: Original Fraunces/DM Sans typefaces, line density, priority; visual hierarchy must remain from ~1–2 metres where physically possible. Do **not** equate nominal 18pt to `18px`; F1 GFX metrics are raster pixel data. Never shrink essential content to 9px merely to fit optional details.
5. **Premeasure all glyphs and functional blocks**: F2 GFX `inkRect/advance`, real Norwegian glyphs, padding, baseline, calendar readable-cell minima, no overlaps; choose a **whole valid plan** before display draw. Do not draw a hero, then discover month/weekday overlaps. Important note: `getTextBounds` is independent of GFX advance; centering must account for negative bearings.
6. **Degrade by priority**: Remove decorative → optional → lower-importance context before reducing readable HERO. Never truncate essential Date/Time facts. If an important label truly cannot fit, choose a documented smaller font variant or omit secondary element with explicit traceable reason. If no valid essential plan fits, render a deliberate safe fallback (not half new/half old layout).
7. **Draw 1-bit** with theme-aware ink, unchanged module separators and frame refresh logic. Lab (JS) and firmware (GFX) need the *same policy inputs / rule decisions* and fixture expectations, even though browsers and GFX raster differently.
8. **Quality gate**: Test all 16 dimensions × all 4×4 starting positions where valid × normal/long/extreme/empty cases × Light/Dark. Test content disclosure, clipping, centering, contrast, meaningful 1–2m hierarchy. Include random review seeds / PDF references, and physical test after a real, safe rollback image is recovered.

### Numeric tokens: distinguish existing from approved

The following are **existing draft Lab candidates, NOT locked values**:
- `ribbon`: width ≥300px and height <152px
- `column`: width <260px and height ≥152px
- `spread`: width ≥530px and height ≥215px
- inset 8/12/16px depending on measured size; gap 6/8/12px
- art permission initially `spread` with safe area ≥560px wide and ≥240px high

These thresholds are in the paired 2026-10-27 Lab/EditorialDesign candidate code and are useful to start a parity test. **Do not promote unreviewed numeric settings to final production policy based only on digital tests.** Account for matte crop and F1 glyph actual bounds first. Priority, complete information, no-surprise clipping and Surf freeze are the settled conceptual invariants.

## Technical correction to current stacked PRs

- [F3 #1434](https://github.com/Vetnor03/frameone-app/pull/1434) introduced `tryDrawEditorialDatePreview`, with **specific branches for CELL_SMALL=4×1 and CELL_MEDIUM=2×2**, hard-coded subdivisions and sizes; [R2A #1437](https://github.com/Vetnor03/frameone-app/pull/1437) added `tryDrawEditorialMicroDatePreview` for **1×1**. These are **valid compile/ink/font experiments** but **not** the final responsive system.
- **STOP extending them** with 1×2/2×1 or further grid-specific renderers. Reuse: F1 bitmap provenance; F2 ink metrics; ink-tested use of Fraunces and DM Sans; existing calendar/holiday functionality. **Replace bespoke Date preview selection with role-driven element plans**, always testing the same semantics across all 16 shapes.
- **Further size-specific R2B development is paused.** The existing [1×2 draft PR #1438](https://github.com/Vetnor03/frameone-app/pull/1438) and [2×1 draft PR #1439](https://github.com/Vetnor03/frameone-app/pull/1439) **already contain source/build-tested standalone previews** (2×1 has [green CI #40547673783](https://github.com/Vetnor03/frameone-app/actions/runs/40547673783)). Keep these only as typography/glyph-geometry experiments and references, **not** as a series to extend or merge unchanged into the future renderer. Before any new per-module Date rendering code, define and validate Date element descriptors and selection/placement rules in a **single shared policy contract** (or declarative data plus generated firmware constants), with JS/firmware decision-parity tests. Prefer one actual authority and generated bindings over duplicated thresholds living permanently in `.mjs` and `.h`.
- Do not merge or flip the draft F3/R2A feature flags; do not deploy old full editorial PR #1423 (it also changes frozen Surf). The old standard firmware is unchanged. **FLASH: NEI.** Actual known-good ALFRED binary rollback remains unverified.

## Next small job (revised from R2B)

Create a **declarative Date element/priority policy specification** plus test fixtures for 1×1, 1×2, 2×1, 2×2, 4×1, and large/calendar shapes, using previously reviewed Lab samples. Document which fields are user-approved versus experiment. Then implement **one general responsive Date composition pipeline** using those element descriptors; use the 16 shapes as test cases. No new size-specific renderer functions.

### Acceptance for this architecture correction

- One Date element classification/priority mapping across all dimensions; role decisions do not fork by `colSpan`/ `rowSpan` constants.
- No partial rendering, important text behind matte, date overflow, or optional art displacing facts.
- No change to real Surf source or its visuals; native tests and physical smoke only before shared-renderer rollout.
- Review results against the archived Lab decision set, not a synthetic screenshot alone.
- This document/pr is **docs-only**, no firmware/API/OTA change; it deliberately does **not** claim runtime adaptation is implemented.
