#pragma once
// Host QA only: actual GxEPD2_BW derives from original Adafruit_GFX.
// A shared virtual base reference lets real Date and News compile as
// independent production-like TUs while both paint the same real BW object.
// Test entrypoint owns actual HostDriver and exposes it as GFX base.
#include <Adafruit_GFX.h>
using FrameDisplay = Adafruit_GFX;
namespace DisplayCore { FrameDisplay& get(); }
