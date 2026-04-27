#pragma once
#include <Arduino.h>
#include "Types.h"
#include "FrameConfig.h"

namespace ModuleStocks {

void setConfig(const FrameConfig* cfg);

// multi-instance: "stocks" or "stocks:2"
// medium/large/xl render chart + bottom value strip (price/change/%)
void render(const Cell& c, const String& moduleName);

}
