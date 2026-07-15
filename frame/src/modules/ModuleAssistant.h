#pragma once
#include <Arduino.h>
#include "Types.h"
#include "FrameConfig.h"

namespace ModuleAssistant {

void setConfig(const FrameConfig* cfg);

// Physical AI Assistant module. Supports "assistant" and "assistant:<id>" keys.
void render(const Cell& c, const String& moduleName);

}
