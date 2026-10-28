# Date R4 — measured calendar-heading rhythm (DRAFT, not flashed)

**Reference:** Original `RE-MIND-layout-review-100 (2).pdf`, page 1, seed 347015390, and the 7-case original-GFX dual-month gallery from #1460. The stacked two-month candidate retained important dates but its two `FreeSansBold12` month titles felt much heavier than the deliberately quiet typographic hierarchy in the approved editorial reference.

## Scope and visual intent

- **Experimental Date only**: the *same* old `drawMonthCalendar` retains default `FreeSansBold12` when the new optional font pointer is null. Existing legacy callers do not supply it, so existing calendars, Surf and all normal firmware remain untouched.
- The default-OFF editorial Date painter passes actual original **DM Sans18** GFX glyphs, as approved from physical font screen 6, for both current and following month headings.
- The original 22px title region still holds the measured title. The existing 10px title gap carries a restrained symmetric one-pixel rule + 3px diamond, based only on measured `blockW` and available whitespace. This adds **zero** height to either month.
- Native `gridFontFits` additionally demands the complete DM18 title ink fit strictly inside the 22px region. If any month (including December→January full rollover heading) cannot fit, the entire experimental Date candidate falls back to unchanged legacy **before any painting**.
- Actual day numbers, weekday labels, ISO week numbers, Today ring, holiday dots, number of month rows, current/next factual selection, Light/Dark theme ink and optional native botanical remain unchanged.
- Offline original-font visual review uses the **same DM18 source 1-bit glyph bitmap** and software-Bresenham ornament pixels only for `editorialTitle` calendar entries. Existing 116-case gallery otherwise retains its previous title style.
- **No per-4×4 design rule or special dimensions**: any admitted editorial Date module uses the same measured font/space criteria. Invalid cells retain their existing legacy renderer.

## QA and limits

- New tests measure all 12 month titles plus rollover year strings using original GFX font ink, validate title/ornament separation and verify legacy title unaffected.
- Seven-case original-F1 gallery asserts two 1-bit ornaments per fully admitted dual-month candidate, zero on fallback, holiday data and botanical priority unchanged.
- Compile and test **both** standard Alfred and isolated `alfred_v1_2_date_editorial_preview`, and verify exact-head all-jobs CI before reporting success.
- This is a visual study, **NOT** a real GxEPD2 framebuffer, hardware image, physical Dark/Light test or final accepted art. Comparing the full two-month density with the original spacious one-month reference remains a design decision.
- Original v2.7.3 rollback BIN + cryptographic hash not independently recovered.

**FLASH: NEI.** PR stays draft, no merge, production activation, deploy or OTA. Surf code untouched.
