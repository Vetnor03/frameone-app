# Original-GFX Date editorial visual audit: second month and holidays

This standalone HTML report is uploaded from CI as
`date-vnext-dual-holiday-review-unflashed`. It uses the same original
Fraunces+DM Sans and FreeSans GFX bitmap sources as earlier Layout Lab
comparisons, but **adds** the measured dual-calendar and full upcoming-holiday
reservations from draft #1455/#1456. It includes full 4×4 October/November,
December/January 2027 rollover, one/two actual sample upcoming labels,
too-long/unsupported label fallbacks, and a 4×3 constrained case.

It is intentionally a **visual study**. It does not contain captures from the
device's GxEPD2 framebuffer, nor a verified e-paper dark-mode waveform, and
the original botanical remains SVG visualization rather than approved artwork.
The stricter C++ calendar glyph preflight may reject some candidates shown
in this gallery; that difference is explicit. It is not a physical read test.

**Acceptance gate:** compare full-screen images with the original 100-PDF
full-frame Date reference (especially page 1, seed 347015390), then decide
whether the second calendar is visually graceful and whether holiday rows
look appropriate before ever activating it. Standard firmware remains
unchanged, Surf frozen, no merge/deploy/OTA/flash.

**FLASH: NEI.**
