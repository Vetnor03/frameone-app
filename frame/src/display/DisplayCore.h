#pragma once
#include <Arduino.h>
#include "DisplayType.h"

namespace DisplayCore {

  void begin();
  // Hibernate and electrically isolate the panel after a physical refresh.
  void end();
  // Lock the already-low Alfred display rail across deep sleep.
  bool prepareForDeepSleep();

  // Return the real type (no casts needed)
  FrameDisplay& get();

  // Paint every addressable pixel with the active theme background.
  // Use this instead of a bare fillScreen() for frame-sized screens so
  // edge pixels cannot retain the opposite theme after refreshes.
  void fillThemeBackground();

  void drawSmallTextTopLeftInFrame(const char* text);
  void drawCenteredTextInFrame(const char* text, int big);

  // New: boxed / shelf screen
  void drawShelfScreen(const String& deviceId);
  void drawRechargeScreen();

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
