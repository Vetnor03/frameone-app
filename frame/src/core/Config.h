#pragma once
#include <Arduino.h>

//Debug Module Display Slots
static const bool DEBUG_DRAW_SLOTS = false;

// =========================
// Visible area (rotation 0)
// =========================
static const int FRAME_X = 58;
static const int FRAME_Y = 39;
static const int FRAME_W = 680;
static const int FRAME_H = 436;

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