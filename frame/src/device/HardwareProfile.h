#pragma once

#include <Arduino.h>

#if defined(FRAME_HW_ALFRED_V1_2)
namespace HardwareProfile {
constexpr bool kAlfredV12 = true;
constexpr int kEpdBusy = 4;
constexpr int kEpdReset = 5;
constexpr int kEpdDc = 6;
constexpr int kEpdCs = 7;
constexpr int kI2cScl = 8;
constexpr int kI2cSda = 9;
constexpr int kEpdSck = 10;
constexpr int kEpdMosi = 11;
constexpr int kEpdPower = 12;
constexpr int kPgoodN = 17;
constexpr int kChargeN = 18;
constexpr uint8_t kMax17048Address = 0x36;
constexpr uint32_t kEpdSpiHz = 4000000UL;
}  // namespace HardwareProfile
#else
namespace HardwareProfile {
constexpr bool kAlfredV12 = false;
constexpr int kEpdBusy = 4;
constexpr int kEpdReset = 16;
constexpr int kEpdDc = 17;
constexpr int kEpdCs = 5;
constexpr int kEpdSck = 18;
constexpr int kEpdMosi = 23;
constexpr int kPowerSense = 39;
}  // namespace HardwareProfile
#endif
