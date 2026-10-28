# Date R4: original native 1-bit botanical line study (UNFLASHED)

**Reference:** `RE-MIND-layout-review-100 (2).pdf`, page 1, seed 347015390. The previous generated Date gallery used smooth *SVG curves* for the botanical, while the firmware drew an unrelated small set of straight lines. That falsely improved its apparent artistic quality relative to what the real frame could render.

## Change

- `DateEditorialBotanical.h` is the **single native source of 71 asymmetrical hand-authored short line segments** in an 84×88 coordinate system; the existing measured, optional botanical rectangle scales these coordinates with the same integer formula. No scaled bitmap, antialiasing, grayscale, new fonts or random refresh variation.
- The Date-only experimental painter uses those exact strokes from the native C++ header, **only** when the composition has a reserved optional art region and no upcoming holiday text claims the region. Every line endpoint stays within that region, itself kept within the physically visible matte.
- Offline source-GFX gallery now **reads the C++ header**, uses the exact same integer stroke endpoints and draws 1-pixel software Bresenham ink instead of separately invented SVG Bezier curves. This is a closer 1-bit visual study, **NOT** an actual GxEPD2 framebuffer capture; diagonals, display controller behavior and physical readability remain unverified.
- The seven-case gallery now opens with measurement overlays hidden so the owner can assess editorial balance without green/red QA rectangles; a “Show measurement guides” checkbox restores ink-bound inspection. Black/white invert remains available. The previous 116-case gallery also uses the same native-origin art.
- No change to the role/fact planner, calendars, holiday selection, fallback logic, default firmware or layout semantics. Neither Surf nor shared module painting is edited.

## Verification

`test_date_botanical_ink.py` checks 71 native segments, all endpoints, sample crop/matte regions, nonempty deterministic 1-bit pixel output and **compiles a C++11 helper** to confirm pixel endpoint transforms equal Python across four rectangles. Other existing Date painting/dual-calendar tests and normal/editorial PlatformIO builds must pass on the exact head.

**Visual acceptance is still open.** The original single-month reference has more air than the dual-month candidate. This change fixes a dishonestly different illustration, but does not mean the new artwork has been physically approved. Need gallery review, exact native framebuffer and physical Light/Dark 1–2m checks after verifying original v2.7.3 BIN+SHA rollback.

**FLASH: NEI.** Draft only; no merge, deploy, firmware activation or OTA.
