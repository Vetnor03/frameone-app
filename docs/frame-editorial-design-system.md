# RE:MIND editorial display system — experimental v1

> Design development only. The existing polished firmware in `main` remains
> the rollback target. No pilot delivery date has been committed.

## Vision

RE:MIND must feel like a beautiful print placed inside a picture frame, not a
phone dashboard. Both existing Light and Dark frame modes share one visual
grammar. The custom-drawn 4×4 grid remains supported, including rectangular
cells not matching the four legacy sizes.

The reference photography is art direction, **not a literal promise**:
a monochrome 800×480 e-paper display cannot reproduce warm paper tones,
fine shaded engravings, or all typographic details in a generated image.
Prioritize legible 1-bit linework now; treat grayscale as an enhancement.

## Information roles

| Role | Examples | Geometry policy |
| --- | --- | --- |
| Hero | date, temperature, countdown number | reserve the strongest type; never shrink to tiny print |
| Heading | News, Wind, Tomorrow | consistent editorial heading, may omit when context is obvious |
| Primary | appointment title, headline, core forecast | readable line wrapping; reduce item count before font size |
| Secondary | location, description, time context | one or two lines; omit first in compact cells |
| List item | appointments, articles, grocery tasks | stack in narrow cells; two columns only with width |
| Measurement | degrees, metres, wind, price | number plus unit are an inseparable group |
| Figure | botanical motif, sea vignette, weather symbol | optional; never displace primary information |
| Divider | boundaries between sections | thin line by default, occasional restrained book ornament |

Important distinction: **role is not priority**. A section title can be
redundant and optional while a short primary fact is essential. Every module
assigns priorities to its own facts; the renderer decides composition.

## Geometry

The plan is selected from actual pixel width/height, never by guessing from
the Small/Medium/Large/XL label:

- Compact: one essential fact and, where possible, one short context line.
- Ribbon: horizontally arranged headline and facts; no multi-paragraph stack.
- Column: vertical hierarchy; no cramped side-by-side measurements.
- Card: section title with 1–3 primary facts.
- Spread: two-column option, additional facts and optional illustration.

The supplied `EditorialDesign.h` implements an allocation-free geometry,
role and visibility policy as a shared foundation. Each module must consume
that policy; **adding the foundation alone is not a completed redesign**.

## Module priorities (content must remain correct)

| Module | Essential | Optional as space grows |
| --- | --- | --- |
| Date | day/month or day and weekday | year, upcoming holidays, art |
| Reminders | next actionable reminder, date/time context | more rows, smart coming up |
| Weather | temperature and conditions | wind, range, rain, weekend insight, engraving |
| News | headline | additional headlines, column separation |
| Surf | spot, surf quality, wave metric | swell, wind, period, best window |
| Ski | conditions and location | resort details, trend |
| Countdown | event and days remaining | time context, decorative accents |
| Soccer | match/team and status | additional matches/results |
| Stocks | ticker, price, movement | secondary statistics and trend |
| Groceries | unchecked items | more rows, completion context |
| Assistant | actionable summary | supporting explanation |

## Composition and controls

1. **Protect content first:** choose and rank facts, then select geometry,
   then fit using measured glyph bounds. Do not ellipsize the only meaningful
   item merely to fit an illustration.
2. **Typography:** use shared roles for headings/primary/meta/metrics.
   Current font assets are FreeSans, including Norwegian glyphs. Before
   deploying editorial serif typography, add and validate proper `æøåÆØÅ`
   coverage in Norwegian and English, plus adequate bold/regular sizes.
3. **Art:** small monochrome vector/bitmap engravings only where there is
   spare room. Decorations are never data or a required tap target.
4. **Dividers:** hairlines by default; explore tasteful centered ornamental
   separators only for wide section divisions. No flourishes at every cell.
5. **Themes:** use `Theme::paper()`/`Theme::ink()` for both modes. Never
   hard-code black-on-white as the only palette.
6. **Custom grid:** test 1×1 through 4×4 and every rectangle; narrow, wide,
   tall, shallow, balanced and full screen.
7. **No data behavior changes:** preserve pairing, offline states, locale,
   news sourcing, integrations, MQTT, low power, update status, and priority
   and event-skipping semantics.

## Release gates

- Shared design rules and module composition inventory.
- Each of the eleven modules reimplemented against the rules, retaining its
  current data and fallback behavior.
- Exhaustive geometry snapshots in both themes and languages, with actual
  texts, empty/loading/error states, and stress cases.
- Firmware compile, PlatformIO, Arduino CLI and memory checks.
- Physical 1m/2m readability and aesthetic comparison using a walnut/blue
  passepartout frame.
- Pilot users get stable, documented behavior only after acceptance.

## Migration approach

Keep the existing renderer as the stable path. Develop the new designs on the
`feat/editorial-responsive-system` branch. Refactor module presentation into
content selection and composition, rather than touching network/provisioning
code. Merge only after all module migrations and QA are complete.

## Editorial design review lab

The experimental branch includes `/editorial-lab`, a self-contained visual
study of the shared content-role rules across custom-grid cell shapes, both
Light and Dark modes, and all supported module categories. It uses **sample
content** only. This review surface is deliberately separate from the real
app's frame mirror and is **not a pixel-perfect proof of the e-paper firmware**.
The old inverted weekday treatment has been removed from the app's Date mirror.

## Approved reference compositions (design preservation)

**First protected reference: Surf Medium, 2×2 cells (400×240 logical pixels).**

- Spot heading with underline
- Left: rating verdict, six filled/outlined rating blocks **or experience dice**, wave range
- Vertical divider
- Right: the "Details:" heading, two distinct directional arrows, period and wind data
- Trend indicator and Today's Best behavior remain controlled by the actual Surf firmware

The experimental firmware now dispatches Surf 2×2 into its **existing, dedicated**
Medium renderer, including when a user draws a 2×2 rectangle in Custom Grid.
Other Surf geometries continue using Surf's adaptive policy. Existing rating,
data sources, refresh behavior, values and other functional logic remain unchanged.

The Editorial Lab's Surf 2×2 sample mirrors the approved information structure,
but remains a browser-drawn *design reference*, not a pixel-accurate GFX rendering.
It currently shows a sample six-block rating; experience-specific dice are preserved
in the physical firmware, and must be represented in the Lab before final approval.

Other modules' reference layouts are *candidates* until individually approved.
Do not indiscriminately freeze every old S/M/L/XL template, and do not overwrite
Surf Medium to satisfy generic typography guidelines. Geometry/body spacing may be
adapted elsewhere as long as the module's protected content/visual hierarchy survives.

## Surf Medium visual acceptance

The Lab's approved 2×2 Surf composition now follows the physical Medium
renderer: Hellestø title/underline, 20×14px rectangles with 6px spacing
and 3px radius, verdict above the blocks, waves below, and a separate
Details panel with swell/wind arrows, their icons and measurements. Unlike
generic editorial sections, the approved reference has **no extra ornamental
heading divider**. The Lab illustrates the same information and broad pixel
bands, but the ESP32 GFX font bounds and direction glyphs are not replicated
exactly. Physical comparison remains required before the final merge.

The browser audit captures two dedicated 2×2 Surf review images:
`surf-medium-reference-light.png` and `surf-medium-reference-dark.png`,
in addition to the 11×16×2 matrix. This is an automated artifact, not a
request for pilot users to click through every grid combination.

## Full-cell density and scroll behavior

On the experimental design Lab, full-size data-rich modules present an
information spread: the most important fact stays prominent, while up to six
measured supporting rows fill a separate information region. This applies to
Reminders, News, Surf (except protected 2×2), Ski, Soccer, Stocks, and Groceries;
Weather reserves a dedicated botanical illustration region and extends its
forecast examples instead. Date keeps its approved calendar composition.
Countdown and AI Follow are deliberately **not** padded with invented content.
All Lab values are illustrative samples, not actual backend forecasts or events.

The Lab owns a viewport-height scroll container because the RE:MIND controller
application locks body scrolling. Desktop and 390px-mobile scrolling are
explicitly checked in Chromium. The full 352-case geometry and glyph audit
remains a separate safeguard; physical e-paper validation is still required.

Weather no longer renders the unrelated mountain/coast landscape concept.
When there is generous room on the real frame, the actual condition-specific
weather icon stays visible and a **separate field-guide botanical sprig** sits
below it. Smaller frames retain the existing condition icon without decoration.

## Weather coastal engraving v1

Weather's large-cell editorial figure is a deliberately quiet Jæren coastal
field-guide vignette sharing Date's fine 1-bit hand-drawn line language.
No reuse of Date's botanical sprig and no colored fills. Shore/grass/sea remain
consistent; WMO and wind drive a limited sky family: fair/partly cloudy,
overcast, windy (>= 8 m/s), rainy and snowy. Precipitation takes priority over
wind and small slots show only the established weather-condition icon.
No extra weather queries and no changes to weather fetch/reliability logic.
The vignette stays inside a reserved illustration band **below** the real
weather icon, never over temperature or forecast. Artwork is decorative only.

The Lab and C++ firmware now share the **same normalized 140×96 line
coordinates**, with the Lab offering a Sky illustration selector to inspect
Clear, Partly Cloudy, Overcast, Windy, Rain and Snow variations. The browser
audit saves all six weather studies independently alongside the 352 layout
snapshots. Lab forecasts remain illustrative sample values.

## Weather engraving v2 — organic ink curves

Replaced the icon-built v1 coast with a restrained hand-composed field-guide
plate, made of continuous cubic contours instead of straight schematic lines.
A softly windswept grass silhouette, low dune, broken waterlines and an airy
unclosed cloud bank form one asymmetric sketch. Clear weather uses negative
space (never a cartoon sun disc). Wind, overcast, rain and snow add only a few
small local accents. Weather WMO/wind classification and original condition
icon remain unchanged. Cubic control points match exactly across SVG and C++;
the hardware samples 12 short integer line segments per curve on the 1-bit
800×480 panel. Date's existing flower is untouched.

**Acceptance:** Art remains inside its allocated Weather-only 4×4 region,
with no large fills or overlapping content. The six Lab variants and the
full 352-layout browser audit are required; real e-paper approval still needs
physical visual testing. Sample content in the Lab is not real weather data.
