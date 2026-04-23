#pragma once
#include <Arduino.h>

namespace TimeSync {
  // Call after Wi-Fi connect. Returns true if time became valid within timeoutMs.
  bool ensure(uint32_t timeoutMs);
}
