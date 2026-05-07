#pragma once
#include "Types.h"
#include "FrameConfig.h"

namespace ModuleSurf {

void setConfig(const FrameConfig* cfg);

// multi-instance: "surf" or "surf:2"
void render(const Cell& c, const String& moduleName);

}
