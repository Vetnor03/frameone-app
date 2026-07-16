//ScreenPairing.h
#pragma once
#include <Arduino.h>

namespace ScreenPairing {

  // Startup screens (calm + minimal)
  void showWifiSetup(const char* ssid);
  void showWifiConnected();
  void showPairCode(const char* code, int expiresInSec, const char* appUrl);
  void showPairingShelf();

  // Utility screens
  void showError(const char* msg);

} // namespace ScreenPairing
