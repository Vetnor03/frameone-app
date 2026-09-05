#pragma once
#include <Arduino.h>

namespace WiFiManagerV2 {
  void begin();

  bool hasCreds();
  void clearCreds();

  // Try connect using saved creds (timeoutMs). The STA listen interval is
  // configured before association so MAX_MODEM can use the pilot 10-second
  // connected-idle target on power-management capable builds.
  bool connectSaved(uint32_t timeoutMs);

  // Apply the operational Wi-Fi/CPU power policy for the current power source.
  // Returns true when battery operation can remain connected using automatic
  // light sleep. A false return on battery means the caller must use the
  // 10-second deep-sleep probe fallback instead of staying awake.
  bool applyOperationalPowerPolicy(bool usbPresent);

  // Save creds to flash
  void saveCreds(const String& ssid, const String& pass);

  // Read creds (for debugging)
  String getSsid();
}
