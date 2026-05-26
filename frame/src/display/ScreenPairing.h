//ScreenPairing.h
#pragma once
#include <Arduino.h>

namespace ScreenPairing {

  // Onboarding screens (short + clear)
  void showWifiSetup();
  void showPairCode(const char* code, int expiresInSec, const char* appUrl);
  void showPaired();

  // Utility screens
  void showError(const char* msg);

} // namespace ScreenPairing
