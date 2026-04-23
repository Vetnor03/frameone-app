#pragma once
#include <Arduino.h>
#include "Types.h"

class BackendApi {
public:
  static bool pairStart(PairStartResponse& out);
  static bool pairStatus(PairStatusResponse& out);
};