#pragma once
#include <Arduino.h>

//Debug Module Display Slots
static const bool DEBUG_DRAW_SLOTS = false;

// =========================
// Logical safe/visible viewport (rotation 0)
// =========================
// Physical panel resolution remains 800x480. These bounds represent the
// calibrated matte opening and should be used for all layout/content math.
static const int VIEWPORT_X = 9;
static const int VIEWPORT_Y = 22;
static const int VIEWPORT_W = 785;
static const int VIEWPORT_H = 458;

// Inclusive bounds for callers that need them.
static const int VIEW_LEFT   = VIEWPORT_X;
static const int VIEW_TOP    = VIEWPORT_Y;
static const int VIEW_RIGHT  = VIEWPORT_X + VIEWPORT_W - 1;
static const int VIEW_BOTTOM = VIEWPORT_Y + VIEWPORT_H - 1;

// Backwards-compatible aliases used throughout the firmware layout code.
static const int FRAME_X = VIEWPORT_X;
static const int FRAME_Y = VIEWPORT_Y;
static const int FRAME_W = VIEWPORT_W;
static const int FRAME_H = VIEWPORT_H;

// =========================
// Backend
// =========================
extern const char* BASE_URL;

// =========================
// ePaper pins (EDIT THESE to your wiring)
// =========================
// Waveshare ePaper typical SPI pins (ESP32):
// SCK=18, MOSI=23, MISO not used, CS=5, DC=17, RST=16, BUSY=4
static const int EPAPER_CS   = 5;
static const int EPAPER_DC   = 17;
static const int EPAPER_RST  = 16;
static const int EPAPER_BUSY = 4;

// (Optional) If your wiring differs, change the constants above.
