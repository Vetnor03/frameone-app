#pragma once
#include "Types.h"
#include "FrameConfig.h"

namespace ModuleSoccer {

void setConfig(const FrameConfig* cfg);

// multi-instance: "soccer" or "soccer:2"
void render(const Cell& c, const String& moduleName);

}