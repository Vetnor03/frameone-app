# Physical layout migration safety

## Known-good baseline

The physical frame is an 800×480 panel with a calibrated content viewport at
`9,22` measuring `785×458`. Layout uses a 4×4 logical grid and the four named
layouts `FULL`, `DEFAULT`, `PYRAMID`, and `SQUARE`. Internal dividers span 95%
of their viewport or region (a 2.5% inset at each end), and there is no outer
border. Phase D1 expanded the historical maximum assignment array and drawing
cell buffer from 8 to the complete 4×4-grid capacity of 16. This is a
resource-capacity change only; every named layout remains frozen.

The authoritative layout contract remains
[`shared/frame-layouts.json`](../shared/frame-layouts.json). The firmware header
is generated from that contract; the baseline test intentionally duplicates
the expected named geometry so an accidental production change fails loudly.

## Migration rule

Future custom-layout work must preserve the four named layouts' logical and
pixel output exactly, including calibration, cell order, slots, sizes, divider
coordinates, and fallback behavior.

The four handmade renderer anchors are also frozen:

- `4×1` → `CELL_SMALL`
- `2×2` → `CELL_MEDIUM`
- `4×2` → `CELL_LARGE`
- `4×4` → `CELL_XL`

Responsive work may only fill the twelve missing geometries; it must not route
these anchors through a new adaptive renderer.

## Migration sequence

- **Phase A — complete:** freeze the baseline in tests and documentation only.
- **Phase B — complete:** add the fixed-capacity, allocation-free `GridLayout`,
  complete 4×4 tiling validation, and the `CELL_ADAPTIVE` representation.
- **Phase C — complete:** derive allocation-free generic divider topology and
  resolve it to calibrated pixels.
- **Phase D1 — complete:** expand assignment and resolved-cell capacity to 16,
  detect custom intent, and stage custom geometry plus assignments using
  complete, all-or-nothing validation while keeping it dormant.
- **Phase D2 — complete:** activate custom runtime drawing for layouts made
  entirely from the four handmade anchor geometries. Custom cells resolve
  atomically and custom dividers use the generic Phase C pipeline; any failed
  render preflight falls back completely to `DEFAULT`.
- **Phase E1 — Date only:** structurally valid custom geometry may now reach the
  module-aware physical preflight. Resolved `Cell` values retain their logical
  `gridCol`, `gridRow`, `colSpan`, and `rowSpan`. The four anchors keep their
  existing renderers exactly; a non-anchor cell is physically supported only
  when its assigned module is `date`. Date uses the dedicated adaptive renderer
  for the twelve missing shapes. Every other adaptive module remains blocked.
- **Later Phase E:** port Weather, Reminders, Countdown, and subsequent modules
  one at a time through the same capability gate. `CELL_ADAPTIVE` must never be
  treated as generally renderable until those module-specific renderers exist.

`isLegacyRenderableGridLayout()` retains its historical name because the config
parser already uses that API. From Phase E1 it means “structurally safe to stage
for custom preflight”; actual physical support is decided by
`ModuleRenderer::canRenderCell()` after slot/module resolution and before the
custom render plan is published.

## Failure behavior

The custom path validates geometry, assignment storage, resolved cells,
module-aware physical capability, logical dividers, and pixel dividers before
beginning a custom display update. The plan is published only after every check
passes. If one adaptive cell is assigned to an unsupported module, the entire
custom plan is rejected and the unchanged named `DEFAULT` path is used. No
partial custom layout is drawn.

Saving/editing arbitrary structurally valid custom layouts in the app remains
allowed. The physical payload gate is stricter: the four anchor geometries are
supported for existing modules, while non-anchor geometry is Date-only in E1.
The payload contract remains geometry plus module assignment; the app never
sends `CellSize`.

## Date Adaptive Lab

Use this non-user-facing fixture to verify several adaptive geometries on one
physical update after flashing E1:

```json
{
  "layout": "custom",
  "custom_layout_id": "date-adaptive-lab",
  "cells": [
    { "slot": 0, "col": 0, "row": 0, "colSpan": 2, "rowSpan": 1, "module": "date" },
    { "slot": 1, "col": 2, "row": 0, "colSpan": 2, "rowSpan": 1, "module": "date" },
    { "slot": 2, "col": 0, "row": 1, "colSpan": 3, "rowSpan": 3, "module": "date" },
    { "slot": 3, "col": 3, "row": 1, "colSpan": 1, "rowSpan": 3, "module": "date" }
  ]
}
```

This exercises `2×1`, `3×3`, and `1×3` adaptive Date compositions while also
checking T-junction divider resolution and non-contiguous cell shapes. It is a
test fixture only and does not become another built-in layout.
