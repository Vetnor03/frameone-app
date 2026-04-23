#pragma once
#include <Arduino.h>
#include "DisplayType.h"

namespace DisplayCore {

  void begin();

  // Return the real type (no casts needed)
  FrameDisplay& get();

  void drawFrameBorder();
  void drawSmallTextTopLeftInFrame(const char* text);
  void drawCenteredTextInFrame(const char* text, int big);

  // New: boxed / shelf screen
  void drawShelfScreen(const String& deviceId);

  // Battery / power UI state
  void setBatteryStatus(int percent, bool isCharging, bool isUsbPresent);
  int getBatteryStatusPercent();
  bool getBatteryIsCharging();
  bool getBatteryUsbPresent();
  void drawBatteryOverlay(bool forceShow);

  // ------------------------------
  // Refresh strategy helpers
  // ------------------------------
  // Force next render to be full refresh (e.g. after FW update / periodic cleanup)
  void forceNextFullRefresh(bool yes);

  // Start a draw cycle (picks partial vs full automatically).
  void beginFrameUpdate();

  // Continue paged drawing
  bool nextFrameUpdate();

  // For debugging / logging
  bool isFullRefreshThisCycle();
}