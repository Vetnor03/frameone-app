# R3 — real F2 C++ ink-measurement bridge (isolated, 27 Oct 2026)

## Dependency strategy
The role-based Date policy stack (#1440 → #1444) previously contained JS measurement parity but **not** original F1/F2 C++ sources. This draft imports the **exact existing Git blobs** from F1 [#1432](https://github.com/Vetnor03/frameone-app/pull/1432) and F2 [#1433](https://github.com/Vetnor03/frameone-app/pull/1433), including both font OFL licenses. Files are copied *unchanged*, not regenerated or redrawn. This permits honest PlatformIO and native linking without inheriting the discarded cell-specific renderer stack #1434–#1439. Reconcile the duplicated F1/F2 file additions with their draft PRs before merging any branch; do **not** merge both independently without a review.

## Actual bridge
`DateF2InkAdapter.h/.cpp` takes a pixel-coordinate cell rectangle plus actual day/month/weekday facts. It uses original F1 font pointers, FrameText's display normalizer, and **F2 `EditorialText::measureLine` and `planLine`** for pre-draw glyph ink metrics, negative bearings, baselines, and text buffers. It tries original Fraunces72 → 48 and DM24 → 18 variants, calls the common `DateRolePlanner::plan` for a complete day/month/weekday candidate, and validates **all three** final text rectangles/baselines before publishing the output. If no complete group fits, returns false for the untouched legacy fallback. No canvas/display calls or grid-span-specific renderer paths exist in this adapter.

All candidate text buffers are owned by the returned result; no heap or display side effects. Font labels are restricted to UTF-8 ASCII/Norwegian core characters that the F2 normalizer can represent without losing an unknown glyph. This stage deliberately leaves broader Unicode translations and optional-fact degradation to a separate parity review.

## QA
`frame/tests/test_date_f2_real_bridge.py` uses a host stub for Arduino + GFX structs but compiles the **real, unchanged F1 font .cpp**, F2 .cpp and FrameText .cpp with GNU++11. The native C++ adapter is compared to JS original-F1 measurement over **all 100 valid 4×4 size/position cases × eight factual variants = 800** plus Norwegian/invalid/boundary cases. Compare full font selection, pixel box positions and text baseline offsets. Verify the adapter is absent from active ModuleDate and never calls drawing methods.

**Not claimed:** This is no real display, framebuffer, GxEPD2 or screen output test; there is no rendering integration. No calendar/holidays/optional fact drawing yet. The JS disclosure planner in #1444 is broader than this **three-fact core adapter**, which intentionally fails closed to the original runtime path if fitting fails. Policy token values are not accepted visual design criteria.

**Frozen:** Surf four source paths unchanged. No active Date, normal firmware behavior, online app, pairing, MQTT, Supabase, OTA or device flash changes. Check CI on this exact head before claiming build success. Physical ALFRED V4 v2.7.3 known-good binary and rollback hash still unknown.

**FLASH: NEI.**
