//DisplayType.h
#pragma once
#include <GxEPD2_BW.h>

// This header must make GxEPD2_750_T7 visible.
// In your install, it’s visible once GxEPD2_BW.h is included (as your .cpp proves).

using FrameDisplay = GxEPD2_BW<GxEPD2_750_T7, GxEPD2_750_T7::HEIGHT>;
