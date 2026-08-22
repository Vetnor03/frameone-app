#pragma once
#include <Arduino.h>
#include "Types.h"
#include "FrameConfig.h"

namespace ModuleRenderer {
  const char* moduleNameForSlot(const SlotModule* assigns, int assignCount, uint8_t slot);
  String moduleForSlot(const SlotModule* assigns, int assignCount, uint8_t slot);
  bool canRenderCell(const char* module, const Cell& cell);
  void renderPlaceholders(const SlotModule* assigns, int assignCount, const Cell* cells, int n);
}
