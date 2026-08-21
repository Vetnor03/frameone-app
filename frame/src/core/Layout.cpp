// Layout.cpp — FULL FILE (themed)
// Divider lines (95% length, no outer border) + optional slot labels + module placeholders

#include "Layout.h"
#include "DisplayCore.h"
#include "Config.h"
#include "ModuleRenderer.h"
#include "Theme.h"
#include "GeneratedLayouts.h"

#include "ModuleDate.h"
#include "ModuleWeather.h"
#include "ModuleSurf.h"
#include "ModuleStocks.h"

#include <GxEPD2_GFX.h>

// Easy battery UI test switch:
// false = real behavior (<20% icon, charging icon when charging)
// true  = always show battery UI with current %
static const bool FORCE_SHOW_BATTERY_UI = false;

// Divider helper (95% length)
static void span95(int start, int length, int& outA, int& outB) {
  int margin = (int)(length * 0.025f); // 2.5% each end => 95% span
  outA = start + margin;
  outB = start + length - margin;
}

static void drawHLine(int y, int x0, int x1) {
  auto& d = DisplayCore::get();
  d.drawLine(x0, y, x1, y, Theme::ink());
}

static void drawVLine(int x, int y0, int y1) {
  auto& d = DisplayCore::get();
  d.drawLine(x, y0, x, y1, Theme::ink());
}

namespace Layout {

int gridX(uint8_t boundary) { return VIEWPORT_X + (VIEWPORT_W * (int)boundary) / GRID_SIZE; }
int gridY(uint8_t boundary) { return VIEWPORT_Y + (VIEWPORT_H * (int)boundary) / GRID_SIZE; }

CellSize cellSizeForGeometry(uint8_t colSpan, uint8_t rowSpan) {
  if (colSpan == 4 && rowSpan == 1) return CELL_SMALL;
  if (colSpan == 2 && rowSpan == 2) return CELL_MEDIUM;
  if (colSpan == 4 && rowSpan == 2) return CELL_LARGE;
  if (colSpan == 4 && rowSpan == 4) return CELL_XL;
  return CELL_ADAPTIVE;
}

GridCell makeGridCell(uint8_t col, uint8_t row, uint8_t colSpan, uint8_t rowSpan,
                      uint8_t slot) {
  return GridCell{col, row, colSpan, rowSpan, slot,
                  cellSizeForGeometry(colSpan, rowSpan)};
}

bool isValidGridCell(const GridCell& c) {
  return c.col < GRID_SIZE && c.row < GRID_SIZE && c.colSpan >= 1 && c.rowSpan >= 1 &&
         c.col + c.colSpan <= GRID_SIZE && c.row + c.rowSpan <= GRID_SIZE;
}

bool validateGridLayout(const GridCell* cells, int count) {
  if (!cells || count < 1 || count > MAX_GRID_CELLS) return false;

  bool occupied[GRID_SIZE][GRID_SIZE] = {};
  uint16_t usedSlots = 0;
  for (int i = 0; i < count; ++i) {
    const GridCell& cell = cells[i];
    if (!isValidGridCell(cell) || cell.slot >= MAX_GRID_CELLS ||
        cell.size != cellSizeForGeometry(cell.colSpan, cell.rowSpan)) return false;

    const uint16_t slotMask = (uint16_t)1U << cell.slot;
    if (usedSlots & slotMask) return false;
    usedSlots |= slotMask;

    for (uint8_t row = cell.row; row < cell.row + cell.rowSpan; ++row) {
      for (uint8_t col = cell.col; col < cell.col + cell.colSpan; ++col) {
        if (occupied[row][col]) return false;
        occupied[row][col] = true;
      }
    }
  }

  for (uint8_t row = 0; row < GRID_SIZE; ++row) {
    for (uint8_t col = 0; col < GRID_SIZE; ++col) {
      if (!occupied[row][col]) return false;
    }
  }
  return true;
}

bool validateGridLayout(const GridLayout& layout) {
  return validateGridLayout(layout.cells, layout.count);
}

bool isLegacyRenderableGridLayout(const GridLayout& layout) {
  if (!validateGridLayout(layout)) return false;
  for (uint8_t i = 0; i < layout.count; ++i) {
    const CellSize size = layout.cells[i].size;
    if (size != CELL_SMALL && size != CELL_MEDIUM && size != CELL_LARGE &&
        size != CELL_XL) return false;
  }
  return true;
}

bool setGridLayout(GridLayout& destination, const GridCell* source, int count) {
  if (!validateGridLayout(source, count)) return false;
  for (int i = 0; i < count; ++i) destination.cells[i] = source[i];
  destination.count = (uint8_t)count;
  return true;
}

bool resolveGridCell(const GridCell& g, Cell& c) {
  if (!isValidGridCell(g)) return false;
  c = Cell{gridX(g.col), gridY(g.row), gridX(g.col + g.colSpan) - gridX(g.col),
           gridY(g.row + g.rowSpan) - gridY(g.row), g.slot, g.size};
  return true;
}

bool buildGridCells(const GridLayout& grid, Cell* outCells, int maxCells,
                    int& outCount) {
  if (!outCells || !validateGridLayout(grid) || maxCells < grid.count) return false;
  Cell staged[MAX_GRID_CELLS];
  for (uint8_t i = 0; i < grid.count; ++i) {
    if (!resolveGridCell(grid.cells[i], staged[i])) return false;
  }
  for (uint8_t i = 0; i < grid.count; ++i) outCells[i] = staged[i];
  outCount = grid.count;
  return true;
}

bool deriveGridDividers(GridDividerLayout& destination, const GridLayout& layout) {
  if (!validateGridLayout(layout)) return false;

  uint8_t owner[GRID_SIZE][GRID_SIZE] = {};
  for (uint8_t index = 0; index < layout.count; ++index) {
    const GridCell& cell = layout.cells[index];
    for (uint8_t row = cell.row; row < cell.row + cell.rowSpan; ++row) {
      for (uint8_t col = cell.col; col < cell.col + cell.colSpan; ++col) {
        owner[row][col] = index;
      }
    }
  }

  GridDividerLayout derived;
  // Stable order: horizontal then vertical, boundary ascending, run ascending.
  for (uint8_t axis = DIVIDER_HORIZONTAL; axis <= DIVIDER_VERTICAL; ++axis) {
    for (uint8_t boundary = 1; boundary < GRID_SIZE; ++boundary) {
      uint8_t position = 0;
      while (position < GRID_SIZE) {
        const bool divided = axis == DIVIDER_HORIZONTAL
          ? owner[boundary - 1][position] != owner[boundary][position]
          : owner[position][boundary - 1] != owner[position][boundary];
        if (!divided) {
          ++position;
          continue;
        }

        const uint8_t from = position++;
        while (position < GRID_SIZE) {
          const bool continues = axis == DIVIDER_HORIZONTAL
            ? owner[boundary - 1][position] != owner[boundary][position]
            : owner[position][boundary - 1] != owner[position][boundary];
          if (!continues) break;
          ++position;
        }
        if (derived.count >= MAX_GRID_DIVIDERS) return false;
        derived.dividers[derived.count++] = GridDivider{
          (GridDividerAxis)axis, boundary, from, position
        };
      }
    }
  }

  destination = derived;
  return true;
}

bool resolveGridDivider(const GridDivider& divider, PixelDivider& output) {
  if ((divider.axis != DIVIDER_HORIZONTAL && divider.axis != DIVIDER_VERTICAL) ||
      divider.boundary < 1 || divider.boundary >= GRID_SIZE ||
      divider.fromBoundary >= divider.toBoundary || divider.toBoundary > GRID_SIZE) return false;

  PixelDivider resolved;
  if (divider.axis == DIVIDER_HORIZONTAL) {
    const int start = gridX(divider.fromBoundary);
    const int end = gridX(divider.toBoundary);
    span95(start, end - start, resolved.x0, resolved.x1);
    resolved.y0 = resolved.y1 = gridY(divider.boundary);
  } else {
    const int start = gridY(divider.fromBoundary);
    const int end = gridY(divider.toBoundary);
    span95(start, end - start, resolved.y0, resolved.y1);
    resolved.x0 = resolved.x1 = gridX(divider.boundary);
  }
  output = resolved;
  return true;
}

void draw(LayoutKey key) {
  // A key alone carries no custom geometry. Never consult hidden/global state.
  if (key == LAYOUT_CUSTOM) key = LAYOUT_DEFAULT;
  auto& d = DisplayCore::get();

  const int x = FRAME_X;
  const int y = FRAME_Y;
  const int w = FRAME_W;
  const int h = FRAME_H;

  int hx0, hx1, vy0, vy1;
  span95(x, w, hx0, hx1);
  span95(y, h, vy0, vy1);

  const int halfY = y + h / 2;
  const int quarterY = y + h / 4;
  const int midX = x + w / 2;

  DisplayCore::beginFrameUpdate();
  do {
    // FULL SCREEN fill so outside matte area uses theme color too
    DisplayCore::fillThemeBackground();

    if (key == LAYOUT_FULL) {
      // no dividers
    }
    else if (key == LAYOUT_DEFAULT) {
      drawHLine(quarterY, hx0, hx1);
      drawHLine(halfY, hx0, hx1);
    }
    else if (key == LAYOUT_PYRAMID) {
      drawHLine(quarterY, hx0, hx1);
      drawHLine(halfY, hx0, hx1);

      int bottomY0, bottomY1;
      span95(halfY, h - (h / 2), bottomY0, bottomY1);
      drawVLine(midX, bottomY0, bottomY1);
    }
    else if (key == LAYOUT_SQUARE) {
      drawHLine(halfY, hx0, hx1);
      drawVLine(midX, vy0, vy1);
    }

    DisplayCore::drawBatteryOverlay(FORCE_SHOW_BATTERY_UI);

  } while (DisplayCore::nextFrameUpdate());
}

int buildCells(LayoutKey key, Cell* outCells, int maxCells) {
  if (!outCells || maxCells <= 0) return 0;

  const GridCell* source = GeneratedLayouts::LAYOUT_SQUARE_CELLS;
  int sourceCount = GeneratedLayouts::LAYOUT_SQUARE_CELL_COUNT;
  if (key == LAYOUT_FULL) { source = GeneratedLayouts::LAYOUT_FULL_CELLS; sourceCount = GeneratedLayouts::LAYOUT_FULL_CELL_COUNT; }
  else if (key == LAYOUT_DEFAULT) { source = GeneratedLayouts::LAYOUT_DEFAULT_CELLS; sourceCount = GeneratedLayouts::LAYOUT_DEFAULT_CELL_COUNT; }
  else if (key == LAYOUT_PYRAMID) { source = GeneratedLayouts::LAYOUT_PYRAMID_CELLS; sourceCount = GeneratedLayouts::LAYOUT_PYRAMID_CELL_COUNT; }
  const int count = sourceCount < maxCells ? sourceCount : maxCells;
  for (int i = 0; i < count; ++i) resolveGridCell(source[i], outCells[i]);
  return count;
}

struct CustomRenderPlan {
  Cell cells[MAX_GRID_CELLS];
  int cellCount = 0;
  PixelDivider dividers[MAX_GRID_DIVIDERS];
  int dividerCount = 0;
};

static bool prepareCustomRender(const FrameConfig& cfg, CustomRenderPlan& output) {
  const CustomLayoutConfig& custom = cfg.customLayout;
  if (!cfg.customLayoutRequested || !custom.valid || !custom.renderable ||
      !isLegacyRenderableGridLayout(custom.grid) || custom.assignCount != custom.grid.count ||
      custom.assignCount > MAX_FRAME_ASSIGNMENTS) return false;

  uint16_t assignedSlots = 0;
  for (uint8_t i = 0; i < custom.assignCount; ++i) {
    const SlotModule& assignment = custom.assigns[i];
    if (assignment.slot >= MAX_GRID_CELLS || assignment.module[0] == '\0') return false;
    const uint16_t mask = (uint16_t)1U << assignment.slot;
    if (assignedSlots & mask) return false;
    assignedSlots |= mask;
  }

  CustomRenderPlan staged;
  if (!buildGridCells(custom.grid, staged.cells, MAX_GRID_CELLS, staged.cellCount)) return false;
  for (int i = 0; i < staged.cellCount; ++i) {
    // D2's hard safety boundary: adaptive cells must not reach ModuleRenderer.
    if (staged.cells[i].size == CELL_ADAPTIVE ||
        !(assignedSlots & ((uint16_t)1U << staged.cells[i].slot))) return false;
  }

  GridDividerLayout logical;
  if (!deriveGridDividers(logical, custom.grid)) return false;
  for (uint8_t i = 0; i < logical.count; ++i) {
    if (!resolveGridDivider(logical.dividers[i], staged.dividers[i])) return false;
  }
  staged.dividerCount = logical.count;
  output = staged;
  return true;
}

void drawWithContent(LayoutKey key, const FrameConfig& cfg) {
  auto& d = DisplayCore::get();

  CustomRenderPlan customPlan;
  const bool customReady = key == LAYOUT_CUSTOM && prepareCustomRender(cfg, customPlan);
  const LayoutKey effectiveKey = key == LAYOUT_CUSTOM && !customReady ? LAYOUT_DEFAULT : key;

  ModuleDate::setConfig(&cfg);
  ModuleWeather::setConfig(&cfg);
  ModuleSurf::setConfig(&cfg);
  ModuleStocks::setConfig(&cfg);

  const int x = FRAME_X;
  const int y = FRAME_Y;
  const int w = FRAME_W;
  const int h = FRAME_H;

  int hx0, hx1, vy0, vy1;
  span95(x, w, hx0, hx1);
  span95(y, h, vy0, vy1);

  const int halfY = y + h / 2;
  const int quarterY = y + h / 4;
  const int midX = x + w / 2;

  DisplayCore::beginFrameUpdate();
  do {
    // FULL SCREEN fill so outside matte area matches theme
    DisplayCore::fillThemeBackground();

    if (customReady) {
      for (int i = 0; i < customPlan.dividerCount; ++i) {
        const PixelDivider& divider = customPlan.dividers[i];
        if (divider.y0 == divider.y1) drawHLine(divider.y0, divider.x0, divider.x1);
        else drawVLine(divider.x0, divider.y0, divider.y1);
      }
    } else if (effectiveKey == LAYOUT_FULL) {
      // none
    } else if (effectiveKey == LAYOUT_DEFAULT) {
      drawHLine(quarterY, hx0, hx1);
      drawHLine(halfY, hx0, hx1);
    } else if (effectiveKey == LAYOUT_PYRAMID) {
      drawHLine(quarterY, hx0, hx1);
      drawHLine(halfY, hx0, hx1);

      int bottomY0, bottomY1;
      span95(halfY, h - (h / 2), bottomY0, bottomY1);
      drawVLine(midX, bottomY0, bottomY1);
    } else if (effectiveKey == LAYOUT_SQUARE) {
      drawHLine(halfY, hx0, hx1);
      drawVLine(midX, vy0, vy1);
    }

    Cell namedCells[MAX_GRID_CELLS];
    Cell* cells = customReady ? customPlan.cells : namedCells;
    int n = customReady ? customPlan.cellCount : buildCells(effectiveKey, namedCells, MAX_GRID_CELLS);
    const SlotModule* assigns = customReady ? cfg.customLayout.assigns : cfg.assigns;
    const int assignCount = customReady ? cfg.customLayout.assignCount : cfg.assignCount;

    ModuleRenderer::renderPlaceholders(assigns, assignCount, cells, n);

#if DEBUG_DRAW_SLOTS
    d.setTextColor(Theme::ink());
    d.setTextSize(1);
    for (int i = 0; i < n; i++) {
      d.setCursor(cells[i].x + 6, cells[i].y + 14);
      d.print("S");
      d.print(cells[i].slot);
    }
#endif

    DisplayCore::drawBatteryOverlay(FORCE_SHOW_BATTERY_UI);

  } while (DisplayCore::nextFrameUpdate());
}

} // namespace Layout
