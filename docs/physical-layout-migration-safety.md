# Physical layout migration safety

## Known-good baseline

The physical frame is an 800×480 panel with a calibrated content viewport at
`9,22` measuring `785×458`. Layout uses a 4×4 logical grid and the four named
layouts `FULL`, `DEFAULT`, `PYRAMID`, and `SQUARE`. Internal dividers span 95%
of their viewport or region (a 2.5% inset at each end), and there is no outer
border. The current maximum assignment array and drawing cell buffer are both
8.

The authoritative layout contract remains
[`shared/frame-layouts.json`](../shared/frame-layouts.json). The firmware header
is generated from that contract; the baseline test intentionally duplicates
the expected named geometry so an accidental production change fails loudly.

## Migration rule

Future custom-layout work must preserve the four named layouts' logical and
pixel output exactly, including calibration, cell order, slots, sizes, divider
coordinates, and fallback behavior.

## Planned sequence

- **Phase A — complete:** freeze the baseline in tests and documentation only.
- **Phase B — complete:** add the fixed-capacity, allocation-free `GridLayout`,
  complete 4×4 tiling validation, and the `CELL_ADAPTIVE` representation. This
  foundation is not active from backend configuration and makes no renderer or
  physical-output changes.
- **Phase C — this PR:** derive allocation-free generic divider topology and
  resolve it to calibrated pixels. The engine is verified against the legacy
  named layouts but is not active in runtime drawing.
- **Phase D:** controlled custom-layout activation, `FrameConfig` geometry
  parsing, capacity expansion, and safe fallback to `DEFAULT`.
- **Phase E:** add physical responsive module renderers, one module at a time.

## Failure behavior

A future custom-layout implementation must validate geometry before use,
reject malformed layouts, fall back safely to the existing `DEFAULT` layout,
and never render partially invalid custom geometry. This document defines the
migration contract only; it does not implement that machinery.
