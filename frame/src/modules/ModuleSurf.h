#pragma once
#include "Types.h"
#include "FrameConfig.h"

namespace ModuleSurf {

void setConfig(const FrameConfig* cfg);

// Preload HTTP/JSON data before entering the e-paper paged draw loop.
void preload(const String& moduleName, CellSize size);

// multi-instance: "surf" or "surf:2"
void render(const Cell& c, const String& moduleName);

}
