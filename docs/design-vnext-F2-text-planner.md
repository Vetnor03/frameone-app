# F2 — opt-in, non-invasive editorial text planning

**Status:** F2 implementation candidate, stacked on [F1 #1432](https://github.com/Vetnor03/frameone-app/pull/1432). This branch/PR must target `feat/design-vnext-f1-original-font-assets` until F1 merges. Tracker [#1429](https://github.com/Vetnor03/frameone-app/issues/1429); Phase-0 baseline [#1430](https://github.com/Vetnor03/frameone-app/issues/1430).

## Exactly what was added

- `frame/src/display/EditorialText.h/.cpp`: **pure planning only**. It never obtains `DisplayCore::get()`, calls GFX draw methods, or sets fonts / colors / wrapping globally. No module uses it. No data migration or device/OTA change.
- `measureLine(font, alreadyNormalizedLatin1, result)`: reads the actual `GFXglyph` x/y offsets, width/height, `xAdvance` and font `yAdvance` from PROGMEM; calculates **visible ink bounds independently from cursor advance**. Returns an error for glyphs outside the font's single-byte range and for newline; does not invent replacement glyphs.
- `planLine(font, utf8, callerScratch, capacity, area, inset, hAlign, vAlign, result)`: invokes the **existing** `FrameText::normalizeUtf8ForDisplay` without modifying it. Rejects insufficient caller-owned buffer rather than silently truncating. Computes baseline/cursor with actual glyph offsets so CENTER refers to *visible ink* (including negative bearings), not GFX cursor advance. Rejects text not fitting padded rectangle. Never draws or clips content.
- `frame/tests/test_editorial_text_native.py`: compiles actual `EditorialText.cpp` + `FrameText.cpp` with GNU C++17 against an ABI-compatible tiny GFX-font shim; asserts offsets, xAdvance vs ink width, center/right/bottom alignment, ÆØÅæøå and decomposed Å, degree sign, blank, unsupported, insufficient buffer and no-fit behavior.

**This is intentionally *not* a rich text wrapper yet.** It handles one single-line label only. Multi-line wrapping, truncation policy, priorities and module-specific composition remain for Date/News/Reminders/Weather in later separate steps; their current algorithms and semantics are not touched. The output `LinePlan` is a future opt-in input to the module drawing code; no `setTextSize` is applied here. The caller must use `setTextSize(1)`, disable automatic screen-edge wrapping while drawing, and draw the normalized bytes that were measured.

## Safety and acceptance

- [ ] Native F2 test passes in GitHub.
- [ ] Alfred PlatformIO and Arduino builds pass with F1+F2 in the codebase.
- [ ] Compare firmware size/map with F1 to establish that unused F2 does not unintentionally increase flashed image size.
- [ ] Confirm PR has **zero diff** in `ModuleSurf.cpp/.h`, `SurfAdaptivePolicy.h`, `app/lib/surfResponsive.mjs`, every existing module, `ModuleRenderer.cpp`, `FrameText.cpp/.h`, display power and OTA.
- [ ] Existing source SHA checks for Surf remain green; do not substitute a new physical Surf photo in Phase 0.
- [ ] F1's independent asset/rollback gates remain separately tracked and **do not become green by stacking F2**.

**F2 does not authorize merge to main, any font switch, flash or pilot rollout.** First visual integration is **F3 Date**, only after review of these exact APIs. If shared code ever changes later, perform one simple Surf physical smoke check before deployment.
