#pragma once
#include <Arduino.h>
#include "FrameConfig.h"
#include "Types.h"

namespace Layout {
  static const uint8_t GRID_SIZE = 4;
  int gridX(uint8_t boundary);
  int gridY(uint8_t boundary);
  bool isValidGridCell(const GridCell& gridCell);
  bool resolveGridCell(const GridCell& gridCell, Cell& cell);
  void draw(LayoutKey key);

  int buildCells(LayoutKey key, Cell* outCells, int maxCells);

  // NEW: draw layout dividers + allow caller to draw inside cells during same refresh
  void drawWithContent(LayoutKey key, const FrameConfig& cfg);
}
