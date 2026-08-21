# Physical layout migration safety

## Known-good baseline

The physical frame is an 800×480 panel with a calibrated content viewport at
`9,22` measuring `785×458`. Layout uses a 4×4 logical grid and the four named
layouts `FULL`, `DEFAULT`, `PYRAMID`, and `SQUARE`. Internal dividers span 95%
of their viewport or region (a 2.5% inset at each end), and there is no outer
border. Phase D1 expanded the historical maximum assignment array
and drawing cell buffer from 8 to the complete 4x4-grid capacity of 16. This is
a resource-capacity change only; every named layout remains frozen.

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
- **Phase C — complete:** derive allocation-free generic divider topology and
  resolve it to calibrated pixels. The engine is verified against the legacy
  named layouts but is not active in runtime drawing.
- **Phase D1 — complete:** expanded assignment and resolved-cell capacity to
  16, detected custom intent, and staged custom geometry plus assignments using
  complete, all-or-nothing validation while keeping it dormant.
- **Phase D2 — this PR:** introduces an explicit controlled custom runtime path.
  Only fully validated layouts made entirely from the four legacy-anchor cell
  geometries may activate. Custom cells resolve atomically and custom dividers
  use the generic Phase C pipeline, with exact parity against all four named
  layouts. Layouts containing `CELL_ADAPTIVE` remain valid and staged but
  dormant, and any preflight failure falls back completely to `DEFAULT`.
- **Phase E:** port responsive physical module rules and progressively allow
  `CELL_ADAPTIVE`, one module at a time. Remove D2's legacy-only gate only after
  adaptive physical coverage is complete.

## Failure behavior

The custom path validates geometry, legacy renderability, resolved cells,
logical and pixel dividers, and assignment storage before beginning a display
update. Any failure uses the unchanged named `DEFAULT` path, so malformed or
temporarily unsupported geometry cannot produce partial custom output.
