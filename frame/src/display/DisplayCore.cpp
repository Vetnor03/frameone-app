#include "DisplayCore.h"
#include "Config.h"
#include "Theme.h"

#include <Fonts/FreeMonoBold9pt7b.h>
#include <Fonts/FreeMonoBold12pt7b.h>
#include <Fonts/FreeMonoBold18pt7b.h>

// ONE global display instance
static FrameDisplay display(
  GxEPD2_750_T7(EPAPER_CS, EPAPER_DC, EPAPER_RST, EPAPER_BUSY)
);

// Persist across deep sleep (ESP32)
RTC_DATA_ATTR static uint16_t g_refreshCycleCounter = 0;

// State for current draw cycle
static bool g_forceFullNext = false;
static bool g_fullThisCycle = true;

// Battery / power UI state
static int g_batteryPercent = -1;
static bool g_batteryIsCharging = false;
static bool g_batteryUsbPresent = false;

// Every N draws, do a full refresh (ghosting cleanup)
static const uint16_t FULL_EVERY_N = 10;

namespace DisplayCore {

FrameDisplay& get() {
  return display;
}

void begin() {
  display.init(115200);
  display.setRotation(0);
  display.setTextColor(GxEPD_BLACK);

  display.setFullWindow();
  display.firstPage();
  do {
    display.fillScreen(Theme::paper());
  } while (display.nextPage());
}

void setBatteryStatus(int percent, bool isCharging, bool isUsbPresent) {
  if (percent < 0) percent = 0;
  if (percent > 100) percent = 100;
  g_batteryPercent = percent;
  g_batteryIsCharging = isCharging;
  g_batteryUsbPresent = isUsbPresent;
}

int getBatteryStatusPercent() {
  return g_batteryPercent;
}

bool getBatteryIsCharging() {
  return g_batteryIsCharging;
}

bool getBatteryUsbPresent() {
  return g_batteryUsbPresent;
}

static void drawBatteryIcon(int x, int y, int percent) {
  auto& d = DisplayCore::get();

  const int bodyW = 24;
  const int bodyH = 12;
  const int tipW = 3;
  const int tipH = 6;
  const int radius = 2;

  const int tipX = x + bodyW;
  const int tipY = y + (bodyH - tipH) / 2;

  d.drawRoundRect(x, y, bodyW, bodyH, radius, Theme::ink());
  d.fillRect(tipX, tipY, tipW, tipH, Theme::ink());

  const int innerX = x + 2;
  const int innerY = y + 2;
  const int innerW = bodyW - 4;
  const int innerH = bodyH - 4;

  int clamped = percent;
  if (clamped < 0) clamped = 0;
  if (clamped > 100) clamped = 100;

  int fillW = (innerW * clamped) / 100;

  if (clamped > 0 && fillW < 2) fillW = 2;
  if (fillW > innerW) fillW = innerW;

  if (fillW > 0) {
    d.fillRect(innerX, innerY, fillW, innerH, Theme::ink());
  }
}

static void drawChargingBolt(int x, int y) {
  auto& d = DisplayCore::get();

  // Compact bolt to the left of the battery icon
  d.fillTriangle(x + 4, y,     x + 10, y,     x + 5, y + 9, Theme::ink());
  d.fillTriangle(x + 6, y + 7, x + 12, y + 7, x + 7, y + 16, Theme::ink());
}

void drawBatteryOverlay(bool forceShow) {
  auto& d = DisplayCore::get();

  if (g_batteryPercent < 0) return;

  const bool showLow = (g_batteryPercent < 20);
  const bool showCritical = (g_batteryPercent < 10);
  const bool showPower = g_batteryUsbPresent;
  const bool showCharging = g_batteryIsCharging;
  const bool showBolt = showCharging || showPower;

  if (!forceShow && !showLow && !showBolt) return;

  const int iconX = FRAME_X + FRAME_W - 40;
  const int iconY = FRAME_Y + 10;

  drawBatteryIcon(iconX, iconY, g_batteryPercent);

  if (showBolt) {
    drawChargingBolt(iconX - 18, iconY - 1);
  }

  d.setTextColor(Theme::ink());
  d.setTextSize(1);
  d.setFont(&FreeMonoBold9pt7b);

  if (forceShow || showBolt) {
    String pct = String(g_batteryPercent) + "%";

    int16_t x1, y1;
    uint16_t w, h;
    d.getTextBounds(pct.c_str(), 0, 0, &x1, &y1, &w, &h);

    int textX = iconX - (int)w - 8;
    if (showBolt) textX -= 16;
    int textY = iconY + 10;

    d.setCursor(textX, textY);
    d.print(pct);
    return;
  }

  if (showCritical) {
    const char* msg = "Charge now";

    int16_t x1, y1;
    uint16_t w, h;
    d.getTextBounds(msg, 0, 0, &x1, &y1, &w, &h);

    int textX = iconX - (int)w - 8;
    int textY = iconY + 10;

    d.setCursor(textX, textY);
    d.print(msg);
  }
}

void forceNextFullRefresh(bool yes) {
  g_forceFullNext = yes;
}

bool isFullRefreshThisCycle() {
  return g_fullThisCycle;
}

// Pick partial vs full and start the firstPage() loop.
// IMPORTANT: this does NOT draw anything. Your Layout code draws inside the loop.
void beginFrameUpdate() {
  bool periodicFull = ((g_refreshCycleCounter % FULL_EVERY_N) == 0);
  g_fullThisCycle = g_forceFullNext || periodicFull;

  g_forceFullNext = false;
  g_refreshCycleCounter++;

  if (g_fullThisCycle) {
    display.setFullWindow();
  } else {
    display.setPartialWindow(FRAME_X, FRAME_Y, FRAME_W, FRAME_H);
  }

  display.firstPage();
}

bool nextFrameUpdate() {
  return display.nextPage();
}

void drawFrameBorder() {
  display.drawRect(FRAME_X, FRAME_Y, FRAME_W, FRAME_H, Theme::ink());
}

void drawSmallTextTopLeftInFrame(const char* text) {
  display.setFont(&FreeMonoBold9pt7b);
  display.setTextColor(Theme::ink());
  display.setCursor(FRAME_X + 12, FRAME_Y + 24);
  display.print(text);
}

void drawCenteredTextInFrame(const char* text, int big) {
  display.setFont(big ? &FreeMonoBold18pt7b : &FreeMonoBold12pt7b);
  display.setTextColor(Theme::ink());

  int16_t x1, y1;
  uint16_t w, h;
  display.getTextBounds(text, 0, 0, &x1, &y1, &w, &h);

  int x = FRAME_X + (FRAME_W - (int)w) / 2;
  int y = FRAME_Y + (FRAME_H + (int)h) / 2;

  display.setCursor(x, y);
  display.print(text);
}

void drawShelfScreen(const String& deviceId) {
  display.setFullWindow();
  display.firstPage();
  do {
    display.fillScreen(Theme::paper());
    display.setTextColor(Theme::ink());

    const char* line1 = "RE:MIND";
    const char* line2 = "Welcome";
    const char* line3 = "Plug in the frame to begin setup";
    const char* line4 = "This display stays visible without power";

    int16_t x1, y1;
    uint16_t w, h;

    display.setFont(&FreeMonoBold18pt7b);
    display.getTextBounds(line1, 0, 0, &x1, &y1, &w, &h);
    int titleX = FRAME_X + (FRAME_W - (int)w) / 2;
    int titleY = FRAME_Y + 120;
    display.setCursor(titleX, titleY);
    display.print(line1);

    display.setFont(&FreeMonoBold12pt7b);
    display.getTextBounds(line2, 0, 0, &x1, &y1, &w, &h);
    int welcomeX = FRAME_X + (FRAME_W - (int)w) / 2;
    int welcomeY = titleY + 56;
    display.setCursor(welcomeX, welcomeY);
    display.print(line2);

    display.setFont(&FreeMonoBold12pt7b);
    display.getTextBounds(line3, 0, 0, &x1, &y1, &w, &h);
    int infoX = FRAME_X + (FRAME_W - (int)w) / 2;
    int infoY = welcomeY + 74;
    display.setCursor(infoX, infoY);
    display.print(line3);

    String idLine = String("frame id: ") + deviceId;
    display.setFont(&FreeMonoBold9pt7b);
    display.getTextBounds(idLine.c_str(), 0, 0, &x1, &y1, &w, &h);
    int idX = FRAME_X + (FRAME_W - (int)w) / 2;
    int idY = FRAME_Y + FRAME_H - 62;
    display.setCursor(idX, idY);
    display.print(idLine);

    display.getTextBounds(line4, 0, 0, &x1, &y1, &w, &h);
    int helperX = FRAME_X + (FRAME_W - (int)w) / 2;
    int helperY = FRAME_Y + FRAME_H - 26;
    display.setCursor(helperX, helperY);
    display.print(line4);
  } while (display.nextPage());
}

} // namespace DisplayCore