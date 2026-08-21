#pragma once
#include <Arduino.h>
#include "FrameConfig.h"
#include "Types.h"

namespace Layout {
  static const uint8_t GRID_SIZE = 4;
  int gridX(uint8_t boundary);
  int gridY(uint8_t boundary);
  CellSize cellSizeForGeometry(uint8_t colSpan, uint8_t rowSpan);
  GridCell makeGridCell(uint8_t col, uint8_t row, uint8_t colSpan, uint8_t rowSpan,
                        uint8_t slot);
  bool isValidGridCell(const GridCell& gridCell);
  bool validateGridLayout(const GridCell* cells, int count);
  bool validateGridLayout(const GridLayout& layout);
  bool setGridLayout(GridLayout& destination, const GridCell* source, int count);
  bool resolveGridCell(const GridCell& gridCell, Cell& cell);
  bool deriveGridDividers(GridDividerLayout& destination, const GridLayout& layout);
  bool resolveGridDivider(const GridDivider& divider, PixelDivider& output);
  void draw(LayoutKey key);

  int buildCells(LayoutKey key, Cell* outCells, int maxCells);

  // NEW: draw layout dividers + allow caller to draw inside cells during same refresh
  void drawWithContent(LayoutKey key, const FrameConfig& cfg);
}
