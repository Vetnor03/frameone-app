#pragma once
#include <Arduino.h>
#include "FrameConfig.h"

namespace UpdateChecker {
  void begin();

  bool hasConfigChanged(const String& deviceToken, String& outUpdatedAt);

  void saveApplied(const String& updatedAt);
  String getLastApplied();

  bool shouldForceRedrawForFirmware(const char* fwVer);
  void saveFirmwareVersion(const char* fwVer);

  bool shouldForcePeriodicRefresh(uint16_t wakesPerRefresh);
  void noteWake();
  void resetWakeCounter();

  String getLastReminderSig();
  void saveReminderSig(const String& sig);
  bool hasRemindersChanged(const String& deviceToken, String& outSig);

  String getLastSurfSig();
  void saveSurfSig(const String& sig);
  bool hasSurfChanged(const FrameConfig& cfg, const String& deviceToken, String& outSig);

  bool getLastUsbPresent();
  void saveUsbPresent(bool usbPresent);

  int getLastBatteryPercent();
  void saveBatteryPercent(int percent);
}