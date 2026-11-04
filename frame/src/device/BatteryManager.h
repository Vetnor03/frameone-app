#pragma once
#include <Arduino.h>

struct BatteryState {
  float rawVoltage;
  float smoothedVoltage;
  int percent;
  bool usbPresent;
  bool isCharging;
  bool requiresRecharge;
  // USB is present, but the depleted cell has not yet reached the safe recovery threshold.
  bool recoveryCharging;
};

namespace BatteryManager {
  void begin();
  BatteryState readAndUpdate(bool usbPresent);
  void logState(const char* label, const BatteryState& state);

  float getLearnedFullVoltage();
  int getLearnedFullSampleCount();
}
