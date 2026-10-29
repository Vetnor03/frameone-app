#pragma once
// Include this only after the REAL GxEPD2_BW template and Mock750T7 alias.
using FrameDisplay = HostDriver;
namespace DisplayCore { FrameDisplay& get(); }
