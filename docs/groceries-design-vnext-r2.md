# Groceries Design vNext — R2 genuine native visual QA

13 November 2026 · [R2 draft PR #1520](https://github.com/Vetnor03/frameone-app/pull/1520) · [Task #1519](https://github.com/Vetnor03/frameone-app/issues/1519) · master #1429

**Experimental visual design only.** Not reviewed or accepted on the physical
V4 frame; not production-merged, and no OTA or physical flashing.

## What is actually implemented

- Approved **DM Sans18 / DM Sans24** GFX bitmap fonts for item names and
  quantities; DM Sans18 for measured section headings. Fallback to the
  existing FreeSans text fitting when a complete original bitmap item
  cannot fit. Both paths use the same selected grocery item.
- The **same 7-pixel original News diamond**, drawn only when **two or
  more grocery items are displayed in the current cell**. Horizontal
  strips retain the existing columns/dividers and don't gain decorative
  bullets. One displayed item (including one item and `+N more`) has none.
- Measured text vertically centered within its allocated row. When
  sufficient height is available, a more generous, responsive visual
  row step (up to 42px) uses free space elegantly for **the already
  selected items**. The old 26px step is **still** used for item
  capacity and overflow calculations.
- Day/dinner headings, menu, running-low and recipe ideas remain in
  their original priority/family sections; no new sorting, API,
  date or data behaviors.

## Native QA (not a mockup)

[CI #43422906150](https://github.com/Vetnor03/frameone-app/actions/runs/43422906150) **PASS**.

The test script **extracts the actual adaptive C++ renderer from
`ModuleGroceries.cpp`** on each run. It compiles that C++ together
with the untouched `GroceriesAdaptivePolicy.h`, original
`GroceriesEditorialPreview.h`, real approved DM Sans bitmap arrays
and real existing FreeSans bitmap arrays. It uses deterministic local
fixtures to replace network/RTC input; it does NOT execute the
production network/API or physical panel controller.

- **384** real C++ 1-bit raster outputs = 12 scenarios × 16 cell spans
  × Light/Dark.
- **192 / 192** Light and Dark pairs are exact pixel inverses.
- **0** off-panel pixels in all scenarios.
- **0** item/cache mutation failures.
- **97** paired scenarios display native editorial diamonds; none are
  drawn when fewer than two items are selected.
- Source-integrity test against `origin/main`: existing fetch/auth,
  four-hour rotation, formatting policy, dinner selectors, existing
  legacy size renderers, and adaptive source policy retained.
- **384/384 scenario manifest fields (visible capacity, overflow,
  rotation, menu/insight presence and diamond count) unchanged**
  versus initial R2 source render before optical spacing improvements.

Native artifact: **`RE_MIND_GROCERIES_R2_ORIGINAL_CPP_16_LIGHT_DARK`**
in CI #43422906150; contains original binary PBMs, 24 complete
16-layout contact sheets and a CSV manifest, not HTML screenshots.

## Review questions / remaining work

1. View the 16-size `review_normal_light.png` and
   `review_normal_dark.png` contact sheets. Inspect 1×2, 2×2,
   3×2, 4×2, 4×4 closely at native pixel size (not scaled HTML).
2. Check editorial visual balance, line separation, physical
   readability, quantity label visibility and decorative bullet rhythm.
3. Verify representative `review_long`, `review_quantity`,
   `review_forty`, `review_norwegian`, `review_empty`,
   `review_dinner_only` and `review_failed`.
4. No owner approval yet. After digital feedback and refinements,
   build an isolated **USB-only V4 B/W 1–16, L/D + 4×4 grid** sketch.
   Require explicit later approval to flash that ZIP to a test frame.
5. Once physically approved, integrate only approved Groceries runtime
   changes from then-current `main`; retest News + Date/Weather/Surf/
   Reminders. Do not merge the experimental QA history.

*One caveat*: the original layout may show a small, deliberately
truncated ingredient on crowded cells, because the original product
had that fallback. This R2 review does not authorize changing the
existing truncation semantics or 4-hour selection just to fit more
decorative content.
