#pragma once
#include <Arduino.h>
#include "Types.h"
#include "FrameConfig.h"

namespace ModuleRenderer {
  bool canRenderCell(const char* module, const Cell& cell);
  String moduleForSlot(const SlotModule* assigns, int assignCount, uint8_t slot);
  void renderPlaceholders(const SlotModule* assigns, int assignCount, const Cell* cells, int n);
}
