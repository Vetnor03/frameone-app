#pragma once
#include "Types.h"
#include "FrameConfig.h"

namespace ModuleSoccer {

void setConfig(const FrameConfig* cfg);

// Fetch once before the synchronous paged e-paper draw begins.
void preload(const String& moduleName);

// multi-instance: "soccer" or "soccer:2"
void render(const Cell& c, const String& moduleName);

}