#pragma once
#include <Arduino.h>

namespace UpdateChecker {
  void begin();
  bool fetchContentSignature(const String& deviceToken, String& outSignature);
  String getLastContentSignature();
  void saveContentSignature(const String& signature);
  void saveFirmwareVersion(const char* fwVer);
  bool hasLastUsbPresent();
  bool getLastUsbPresent();
  void saveUsbPresent(bool usbPresent);
  bool detectAndPersistUsbStateChange(bool usbPresent, bool isStableSample, bool& outHadPrevious);
  void saveBatteryPercent(int percent);
}
