#pragma once
// Host-only display replacement for compiling the *real* ModuleDate.cpp.
#include "../CaptureFrameDisplay.h"
using FrameDisplay = CaptureFrameDisplay;
namespace DisplayCore {FrameDisplay& get();}
