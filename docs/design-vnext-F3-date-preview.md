# RE:MIND Design vNext — F3 Date-only visual preview

**Status 27.10.2026: experimental build candidate; preview OFF by default.** F3 is stacked on [F2 PR #1433](https://github.com/Vetnor03/frameone-app/pull/1433), which itself depends on [F1 PR #1432](https://github.com/Vetnor03/frameone-app/pull/1432). Master issue [#1429](https://github.com/Vetnor03/frameone-app/issues/1429). **Do not merge or flash until all independently tracked baseline/rollback gates are met.**

## What this first experiment does

- **Only `frame/src/modules/ModuleDate.cpp`** has a Date-only opt-in call. All other renderer modules, including all Surf source files, are unchanged.
- `REMIND_F3_DATE_PREVIEW_ENABLED` defaults to `0` in source. Normal `alfred_v1_2` and ordinary Arduino exported builds thus retain **bytewise-identical Date renderer calls and visual output**, without loading the preview fonts or altering shared text defaults.
- **Only anchor cells** `CELL_SMALL` (4×1, 800×120) and `CELL_MEDIUM` (2×2, 400×240) are previewed. Large/XL/date-calendar/holiday/adaptive/merged cells intentionally keep their existing behavior for this first visual pass; no unsupported cell is silently forbidden.
- The single-line preview uses the **original** recovered `Fraunces72`, `DM Sans24` and `DM Sans18` from screen test 6 via F1, and the **F2** ink-aware `planLine` before drawing anything. In 4×1 the one-line composition is *weekday — large serif day — month — year*; in 2×2 it becomes a centered vertical rhythm of *year / month / large serif day / weekday*.
- All four labels must fully fit their own subrectangles with a 2px inset before **any pixel** is drawn; a failed measurement returns control to the existing Date renderer. F3 does not show a partial composition, silently shrink typography, or alter module data.
- Both 4×1 and 2×2 anchors first intersect their `Cell` with the physically visible panel **x=58..737, y=39..474**, including Date at the top, bottom, left or right edges. The 4×1 top preview begins at x≥62/y≥41; 2×2 receives its own inset *after* visible-area intersection. This is an experimentally grounded viewport safeguard, not a guarantee for different mounts.
- The calendar, holiday lists, time-zone, normal/current date state, and styling of other modules are left untouched. Existing English weekday/month labels are deliberately preserved in this candidate; localization/content restructuring is a separate design decision.

## How to build without flashing

Standard build (F3 disabled, no changed visuals):

```sh
pio run -d frame -e alfred_v1_2
```

Experimental build (F3 enabled, **unflashed**, never OTA):

```sh
pio run -d frame -e alfred_v1_2_date_preview
```

These two build targets are different. The default PlatformIO environment remains `alfred_v1_2`. A CI-only opt-in build step compiles the activated code; the Arduino CI upload artifacts remain the *standard disabled* variant. No production configuration switch, cloud feature flag or user-facing setting has been added.

## F3 acceptance matrix

- [ ] New isolated preview C++ source compiles **with F3=1** in Alfred PlatformIO.
- [ ] Standard Alfred and Arduino builds pass with **F3=0**.
- [ ] Original-font glyph-bounds regression checks all weekday/month/day samples in **all four 4×1 row positions and all four 2×2 quadrants**, against the matte viewport.
- [ ] Existing frame and F1/F2/native regression tests pass.
- [ ] Actual PR diff contains no edits to any Surf-related source file or shared renderer.
- [ ] Numerical program flash and RAM delta: standard vs F2 and *opted-in* F3, with sizes.
- [ ] Physical photos of **Date 4×1 and 2×2 on a safely restorable test unit**, comparison against baseline, and readable 1–2 m type after a **separately authorized** flash. Not possible just from emulator or green CI.
- [ ] Confirm actual F1/F2 merge order and known-good physical rollback before any flash/pilot rollout.
- [ ] One physical Surf smoke test **only when shared renderer changes later and before rollout**. No new Surf reference-image matrix needed now.

**No claim of pixel-perfect equality with the HTML Lab or the approved screen 6 can be made until the panel has been compared.** This isolated F3 preview is for design validation, not an approved new default Date layout.
