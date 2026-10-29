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
