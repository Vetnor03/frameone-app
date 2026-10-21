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
