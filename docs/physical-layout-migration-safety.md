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
- **Phase D2 — complete:** introduced an explicit controlled custom runtime path.
  Only fully validated layouts made entirely from the four legacy-anchor cell
  geometries may activate. Custom cells resolve atomically and custom dividers
  use the generic Phase C pipeline, with exact parity against all four named
  layouts. Layouts containing `CELL_ADAPTIVE` remain valid and staged but
  dormant, and any preflight failure falls back completely to `DEFAULT`.
- **Phase E1 — complete:** enables adaptive physical rendering for the Date
  module only. Physical capability is module-aware: the four anchor geometries
  retain their existing module behavior, while a `CELL_ADAPTIVE` cell is
  accepted only when its assignment is Date. `CELL_ADAPTIVE` is **not**
  generally supported. Future phases will add other modules one at a time.
- **Phase E2 — this PR:** enables adaptive physical rendering for Weather as
  the second exact-base-module capability. Weather instance suffixes are
  accepted, but lookalike prefixes are rejected. All other adaptive modules
  continue to trigger atomic fallback.

### DATE ADAPTIVE LAB

This test/documentation fixture exercises adaptive Date compositions and a
T-junction; it is not a built-in layout:

```json
[
  {"slot":0,"col":0,"row":0,"colSpan":2,"rowSpan":1,"module":"date"},
  {"slot":1,"col":2,"row":0,"colSpan":2,"rowSpan":1,"module":"date"},
  {"slot":2,"col":0,"row":1,"colSpan":3,"rowSpan":3,"module":"date"},
  {"slot":3,"col":3,"row":1,"colSpan":1,"rowSpan":3,"module":"date"}
]
```

### WEATHER ADAPTIVE LAB

This test-only payload exercises shallow landscape Weather cells, a large
forecast cell, a narrow portrait cell, and the same T-junction topology:

```json
[
  {"slot":0,"col":0,"row":0,"colSpan":2,"rowSpan":1,"module":"weather:1"},
  {"slot":1,"col":2,"row":0,"colSpan":2,"rowSpan":1,"module":"weather:1"},
  {"slot":2,"col":0,"row":1,"colSpan":3,"rowSpan":3,"module":"weather:1"},
  {"slot":3,"col":3,"row":1,"colSpan":1,"rowSpan":3,"module":"weather:1"}
]
```

## Failure behavior

The custom path validates complete geometry, resolves cells, verifies unique
and complete assignments, checks every cell through the centralized
module-aware capability decision, and only then derives and resolves dividers.
The prepared BSS render plan is published after every step succeeds. Any
failure uses the unchanged named `DEFAULT` path, so malformed or unsupported
geometry cannot produce partial custom output.
