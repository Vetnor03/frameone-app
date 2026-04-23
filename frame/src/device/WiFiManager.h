#pragma once
#include <Arduino.h>

namespace WiFiManagerV2 {
  void begin();

  bool hasCreds();
  void clearCreds();

  // Try connect using saved creds (timeoutMs)
  bool connectSaved(uint32_t timeoutMs);

  // Save creds to flash
  void saveCreds(const String& ssid, const String& pass);

  // Read creds (for debugging)
  String getSsid();
}
