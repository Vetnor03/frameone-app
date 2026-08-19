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

bool isValidGridCell(const GridCell& c) {
  return c.col < GRID_SIZE && c.row < GRID_SIZE && c.colSpan >= 1 && c.rowSpan >= 1 &&
         c.col + c.colSpan <= GRID_SIZE && c.row + c.rowSpan <= GRID_SIZE;
}

bool resolveGridCell(const GridCell& g, Cell& c) {
  if (!isValidGridCell(g)) return false;
  c = Cell{gridX(g.col), gridY(g.row), gridX(g.col + g.colSpan) - gridX(g.col),
           gridY(g.row + g.rowSpan) - gridY(g.row), g.slot, g.size};
  return true;
}

void draw(LayoutKey key) {
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

  const GridCell* source = GeneratedLayouts::SQUARE;
  int sourceCount = GeneratedLayouts::SQUARE_COUNT;
  if (key == LAYOUT_FULL) { source = GeneratedLayouts::FULL; sourceCount = GeneratedLayouts::FULL_COUNT; }
  else if (key == LAYOUT_DEFAULT) { source = GeneratedLayouts::DEFAULT; sourceCount = GeneratedLayouts::DEFAULT_COUNT; }
  else if (key == LAYOUT_PYRAMID) { source = GeneratedLayouts::PYRAMID; sourceCount = GeneratedLayouts::PYRAMID_COUNT; }
  const int count = sourceCount < maxCells ? sourceCount : maxCells;
  for (int i = 0; i < count; ++i) resolveGridCell(source[i], outCells[i]);
  return count;
}

void drawWithContent(LayoutKey key, const FrameConfig& cfg) {
  auto& d = DisplayCore::get();

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

    if (key == LAYOUT_FULL) {
      // none
    } else if (key == LAYOUT_DEFAULT) {
      drawHLine(quarterY, hx0, hx1);
      drawHLine(halfY, hx0, hx1);
    } else if (key == LAYOUT_PYRAMID) {
      drawHLine(quarterY, hx0, hx1);
      drawHLine(halfY, hx0, hx1);

      int bottomY0, bottomY1;
      span95(halfY, h - (h / 2), bottomY0, bottomY1);
      drawVLine(midX, bottomY0, bottomY1);
    } else if (key == LAYOUT_SQUARE) {
      drawHLine(halfY, hx0, hx1);
      drawVLine(midX, vy0, vy1);
    }

    Cell cells[8];
    int n = buildCells(key, cells, 8);

    ModuleRenderer::renderPlaceholders(cfg.assigns, cfg.assignCount, cells, n);

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
