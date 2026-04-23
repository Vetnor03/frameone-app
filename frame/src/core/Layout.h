#pragma once
#include <Arduino.h>
#include "FrameConfig.h"
#include "Types.h"

namespace Layout {
  void draw(LayoutKey key);

  int buildCells(LayoutKey key, Cell* outCells, int maxCells);

  // NEW: draw layout dividers + allow caller to draw inside cells during same refresh
  void drawWithContent(LayoutKey key, const FrameConfig& cfg);
}
