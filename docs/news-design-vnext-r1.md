# RE:MIND News Design vNext — R1 real C++ bitmap preview

13 November 2026 · [News issue #1515](https://github.com/Vetnor03/frameone-app/issues/1515) · [Master tracker #1429](https://github.com/Vetnor03/frameone-app/issues/1429)

## Verified existing production behavior — frozen

`frame/src/modules/ModuleNews.cpp` is the source of truth. The renderer was
using FreeSans9 body and FreeSansBold12 header, a centered 21px-list or 1–3
columns on shallow cells. Headlines were not ellipsis-truncated but the
fonts were often too small for a room-visible news display.

This R1 branch preserves exactly:
- Live `/api/news?feed=<top|latest>&limit=14&links=0&raw_titles=1` and
  device authenticated fetching, original NRK backend, 14-item storage limit,
  224-byte headline buffer and response limits.
- Order of the original normalized **full** headline strings. No filtering,
  score changes, new date logic or sorting. "News" is not the HERO;
  the actual headline text is the primary information.
- Existing per-language `News/Nyheter`, empty/unavailable handling,
  atomic snapshot adoption, cache retention on V4 RTC, existing invalidation
  only when visible content changes or user explicitly updates.
- Existing `renderShallow` and `renderList` remain textually intact and
  active as fallback on failed GFX preflight. Power, Wi-Fi, pairing, Skip,
  OTA, and locked other modules not modified.

## R1 implementation

Changed production scope: opt-in include `RemindEditorialFonts.h`, new isolated
`NewsEditorialPreview.h` included **inside** `ModuleNews`, and a conditional
call immediately before the original renderer. No news data-path rewriting.

Adaptive pixel rules:
- C++ measures **actual original Fraunces48 / DM Sans24 / DM Sans18**
  bitmap ink bounds via the same GFX helper as firmware. There is no scaling,
  HTML, SVG or fake text.
- Tiny/shallow cells omit a large section heading and dedicate space to
  **complete, legible headlines**, rather than "News".
- Wide cells can display two horizontal columns; content stays in unchanged
  row-major feed order: item 0 then 1, item 2 then 3. Medium/tall cells use
  a clean single-column stack.
- Spacious wide cells with **2–5** articles and enough measured space can
  show *the original first headline* using Fraunces48 across the width,
  followed by original DM Sans24 columns. This is visual emphasis only,
  not a computed "most important/most recent" ranking.
- Busy feeds use consistently legible DM Sans24. Only where no complete
  headline fits does the preview attempt DM Sans18.
- Up to 8 viewable full headlines are planned; `+N more` accurately accounts
  for all remaining fetched source items. If even one complete title or an
  overflow label cannot fit, the **unchanged original renderer** is used.
- The >6KB plan is allocated lazily on the heap and reused. No large plan copy
  on the ESP32 stack. Failure to allocate leaves the original renderer active.

This is a content/geometry-first policy, not 16 hand-drawn layouts.

## R1 actual native GFX QA

The harness in `frame/tests/native/news/news_native.cpp` compiles the SAME
preview header and original Fraunces/DM Sans bitmap arrays, using a tiny
dependency-free C++ GFX adapter. It writes original binary P4 1-bit data with
the exact glyph pixels and unscaled PNG contact sheets. It is not a simulation
of the whole ESP32/HTTP/EPD controller and does not rasterize legacy fallback.

10 scenarios × 16 geometries × Light/Dark = **320 tests**:
`normal`, `single`, `two`, `six`, `fourteen`, `long`,
`norwegian`, `unbreakable`, `empty`, `unavailable`.

[Native Actions run](https://github.com/Vetnor03/frameone-app/actions/runs/43389402382)
**PASS** at `b8b8e062`: **238/320 actual native previews**; **82 safe
legacy fallbacks**, including 64 deliberately empty/unavailable cases.
0 clipped pixels and 0 content/order contract violations. Exact
Light/Dark inverse on all **119** rendered pairs; matching fallback choice
on remaining **41** pairs. The renderer never modifies the input News cache,
the source title, or title order, and a complete wrapped headline reconstructs
the same original bytes.

Original full-resolution 1-bit PBMs, per-scenario contact sheets and scenario
manifest are in the Actions artifact `news-r1-original-gfx-1bit-16-layouts`.

**Unfinished QA:** Full firmware CI must pass for latest branch head. Real
ESP32-S3/Aduino build, source profile/cache tests, legacy fallback in
production, actual physical 1–2 m readability on all 16 V4 cell geometries
and both themes, and user visual approval remain separate gates.

## Next phase

R2: owner reviews the 16-form 1-bit contact sheets. Refine optical alignment,
title density and large blank regions only where justified by the rendered
pixels. Add Norwegian `no/nb` and English header validation, source-headline
profiles and complete-data stress cases. Prepare a separate USB V4 visual
QA sketch only after the owner accepts digital proposals. Never merge/OTA
or flash automatically. Once approved, port only runtime code from a clean
`main` into a production PR.

**Date, Weather, Surf, Reminders frozen; no other module changes.**
