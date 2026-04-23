#pragma once
#include <Arduino.h>

namespace DeviceIdentity {
  void begin();

  bool hasDeviceId();
  String getDeviceId();

  bool hasToken();
  String getToken();
  void saveToken(const String& token);
  void clearToken();

  // Keeps device_id, clears token
  void clear();

  // Optional full erase for service / development only
  void factoryWipeAll();
}