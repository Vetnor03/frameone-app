# RE:MIND physical typography calibration (Alfred V1.2)

This is a **USB-only, opt-in firmware test**, not a customer firmware release.
It does not connect Wi-Fi, pair, use MQTT, contact the backend, or persist
settings. It draws one calibration page at a time and then powers the e-paper
rail down. The normal `alfred_v1_2` target stays unchanged.

## Build and flash

Plug the frame into its **supplied USB cable**. From the repository root
(with PlatformIO installed):

```sh
pio run -d frame -e alfred_v1_2_typography_audit
pio run -d frame -e alfred_v1_2_typography_audit -t upload
pio device monitor -b 115200
```

If you use the GitHub Actions compiled firmware artifact instead, it is
**unflashed** and specific to the Alfred V1.2 hardware. Do not mistake it for
an OTA/customer firmware. Flash with the matching PlatformIO environment,
including its board and partition settings.

The first page displays automatically when USB is detected. Open the serial
monitor at 115200 baud and send:

- `1`: Sans vs. serif, several sizes; serif samples are ASCII only.
- `2`: Readability ladder, 9 / 12 / 18 / 24 pt.
- `3`: Sixteen 200×120 tiles, light theme.
- `4`: The same dense layout, dark theme.
- `n` or `p`: Next or previous page.

Each page selection causes **one full display refresh**; do not repeatedly
send commands unnecessarily. Unplugging USB suspends the diagnostic.
The panel image can remain visible after power-down; this is normal e-paper
behaviour.

## How to evaluate

For pages 1–2, view the **real panel**, without zoomed camera screenshots,
from approximately 0.5 m, 1 m, and 2 m. Note the smallest style you can
comfortably read without leaning in. Do not judge purely from a browser.

Record your findings:

| Use | Candidate | 0.5 m | 1 m | 2 m |
| --- | --- | --- | --- | --- |
| Secondary details | Sans 9 pt | | | |
| General information | Sans regular 12 pt | | | |
| Module headings | Sans bold 12 pt | | | |
| Important values | Sans bold 18 pt | | | |
| Large numeric values | Sans bold 24 pt (ASCII) | | | |
| Editorial headings | Serif 12/18/24 pt (ASCII) | | | |

For pages 3–4, check that adjacent miniature modules are visually separable
and that 9 pt supporting lines do not blend into divider strokes. Photograph
the actual **physical display** front-on in good lighting and provide both
the photos and the completed/brief readability ratings.

**Norwegian coverage:** The bundled project-specific FreeSans fonts support
`Æ Ø Å æ ø å`, but the stock Adafruit FreeSerif/24pt comparison fonts only
cover ASCII. They are temporary visual candidates. Do not deploy serif
headlines containing Norwegian characters without a proper Latin-1 font.

## Restore normal operation

From the repository root:

```sh
pio run -d frame -e alfred_v1_2 -t upload
```

If normal firmware preserves the previous e-paper pixels, use the app's
**Update** action to request a fresh dashboard after reconnecting. The
diagnostic does not change the frame's pairing or Wi-Fi credentials.

## Release gates

Do not merge this diagnostic into a customer build or use its binary for OTA.
The final font system should satisfy:

1. **Real font metrics:** choose font by measured pixel width and height,
   line wrapping and Norwegian glyph support, not by CSS font-size alone.
2. **Readability:** key information should be comfortably readable around
   1–2 m where the chosen module size permits; 16-cell views have a physical
   upper limit on that requirement.
3. **Adaptive content:** remove low-priority rows *before* shrinking essential
   information below its calibrated minimum.
4. **Hardware parity:** the Lab and firmware must use matching font metrics,
   fallback policies and displayed text.
5. **E-paper evidence:** compare light/dark, line weights, anti-aliasing and
   ghosting on the physical frame before enabling new font families.
