#pragma once
#include <Arduino.h>

struct BatteryState {
  float rawVoltage;
  float smoothedVoltage;
  int percent;
  bool isCharging;
};

namespace BatteryManager {
  void begin();
  BatteryState readAndUpdate(bool usbPresent);
  void logState(const char* label, const BatteryState& state);

  float getLearnedFullVoltage();
  int getLearnedFullSampleCount();
}