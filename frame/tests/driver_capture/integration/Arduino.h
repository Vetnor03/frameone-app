#pragma once
// Host-only Arduino ABI for the unmodified upstream GFX + firmware Date.
#include "../../native_capture/include/Arduino.h"
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <algorithm>
// ARDUINO=100 is set in the g++ invocation so GFX uses Print.h.
class __FlashStringHelper {};

class SPIClass {};
class SPISettings {};
inline float radians(float degrees) { return degrees * 0.01745329251994329577f; }

struct HostSerialLogger {
  void printf(const char*,...)const {}
  void print(const char*)const {}
  void println(const char*)const {}
};
extern HostSerialLogger Serial;
