#pragma once
#include "Types.h"
#include "FrameConfig.h"

namespace ModuleSurf {

void setConfig(const FrameConfig* cfg);

// Scheduled Surf source checks refresh the backend result first, then invalidate
// only the matching local instance so draw() reloads that freshly cached result.
void invalidateScheduled(const String& modulesCsv);

// multi-instance: "surf" or "surf:2"
void render(const Cell& c, const String& moduleName);

}
