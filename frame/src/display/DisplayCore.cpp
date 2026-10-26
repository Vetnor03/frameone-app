#include "DisplayCore.h"
#include "Config.h"
#include "Theme.h"
#include "HardwareProfile.h"
#include <SPI.h>
#include <driver/gpio.h>

#include <Fonts/FreeMonoBold9pt7b.h>
#include <Fonts/FreeMonoBold12pt7b.h>
#include <Fonts/FreeMonoBold18pt7b.h>

// ONE global display instance
static FrameDisplay display(
  GxEPD2_750_T7(EPAPER_CS, EPAPER_DC, EPAPER_RST, EPAPER_BUSY)
);
#if defined(FRAME_IS_ALFRED_V1_2)
static SPIClass alfredEpdSpi(FSPI);
static bool g_powered = false;

// Keep the V4 TXB0108 isolated whenever EPD_VCC is off.
static void forceOutputEnableLow() {
  digitalWrite(HardwareProfile::kEpdOutputEnable, LOW);
  pinMode(HardwareProfile::kEpdOutputEnable, OUTPUT);
  digitalWrite(HardwareProfile::kEpdOutputEnable, LOW);
}

static void forcePowerLow() {
  digitalWrite(HardwareProfile::kEpdPower, LOW);
  pinMode(HardwareProfile::kEpdPower, OUTPUT);
  digitalWrite(HardwareProfile::kEpdPower, LOW);
}

static void safeSignalPins() {
  pinMode(HardwareProfile::kEpdBusy, INPUT);
  pinMode(HardwareProfile::kEpdReset, INPUT);
  pinMode(HardwareProfile::kEpdDc, INPUT);
  pinMode(HardwareProfile::kEpdCs, INPUT);
  pinMode(HardwareProfile::kEpdSck, INPUT);
  pinMode(HardwareProfile::kEpdMosi, INPUT);
}
#endif

// State for current draw cycle
static bool g_forceFullNext = false;
static bool g_fullThisCycle = true;

// Battery / power UI state
static int g_batteryPercent = -1;
static bool g_batteryIsCharging = false;
static bool g_batteryUsbPresent = false;

namespace DisplayCore {

FrameDisplay& get() {
  return display;
}

void fillThemeBackground() {
  // fillScreen() follows the current Adafruit_GFX dimensions, while the
  // explicit full-panel rectangle makes the intended edge-to-edge paint clear
  // and protects against stale border pixels between theme changes.
  display.fillScreen(Theme::paper());
  display.fillRect(0, 0, display.width(), display.height(), Theme::paper());
}

void begin() {
#if defined(FRAME_IS_ALFRED_V1_2)
  // V4 verified sequence: isolate the level shifter, enable EPD_VCC,
  // allow it to stabilize, then enable the TXB0108 before any SPI traffic.
  forceOutputEnableLow();
  forcePowerLow();
  gpio_deep_sleep_hold_dis();
  gpio_hold_dis((gpio_num_t)HardwareProfile::kEpdPower);
  gpio_hold_dis((gpio_num_t)HardwareProfile::kEpdOutputEnable);
  forceOutputEnableLow();
  forcePowerLow();
  digitalWrite(HardwareProfile::kEpdPower, HIGH);
  delay(500);
  digitalWrite(HardwareProfile::kEpdOutputEnable, HIGH);
  delay(100);
  alfredEpdSpi.begin(HardwareProfile::kEpdSck, -1, HardwareProfile::kEpdMosi,
                     HardwareProfile::kEpdCs);
  display.epd2.selectSPI(alfredEpdSpi,
    SPISettings(HardwareProfile::kEpdSpiHz, MSBFIRST, SPI_MODE0));
  g_powered = true;
#endif
  display.init(115200, true, 2, false);
  display.setRotation(0);
  display.setTextColor(Theme::ink());
  // Initialization must not itself touch the panel: the caller selects either
  // a full or a true partial window after render-state comparison.
}

void end() {
#if defined(FRAME_IS_ALFRED_V1_2)
  if (!g_powered) {
    forceOutputEnableLow();
    forcePowerLow();
    gpio_hold_en((gpio_num_t)HardwareProfile::kEpdOutputEnable);
    gpio_hold_en((gpio_num_t)HardwareProfile::kEpdPower);
    return;
  }
  display.hibernate();
  delay(42);
  display.end();
  alfredEpdSpi.end();
  safeSignalPins();
  // Per V4 schematic, disable TXB0108 before switching off the panel rail.
  forceOutputEnableLow();
  delay(20);
  digitalWrite(HardwareProfile::kEpdPower, LOW);
  gpio_hold_en((gpio_num_t)HardwareProfile::kEpdOutputEnable);
  gpio_hold_en((gpio_num_t)HardwareProfile::kEpdPower);
  g_powered = false;
#else
  display.hibernate();
#endif
}

bool prepareForDeepSleep() {
#if defined(FRAME_IS_ALFRED_V1_2)
  forceOutputEnableLow();
  forcePowerLow();
  const esp_err_t oeHold = gpio_hold_en((gpio_num_t)HardwareProfile::kEpdOutputEnable);
  const esp_err_t powerHold = gpio_hold_en((gpio_num_t)HardwareProfile::kEpdPower);
  gpio_deep_sleep_hold_en();
  const bool powerLow = gpio_get_level((gpio_num_t)HardwareProfile::kEpdPower) == 0;
  const bool oeLow = gpio_get_level((gpio_num_t)HardwareProfile::kEpdOutputEnable) == 0;
  Serial.printf("EPD_PWR/OE deep-sleep hold: power=%s oe=%s, levels=%s/%s\n",
                powerHold == ESP_OK ? "enabled" : "failed",
                oeHold == ESP_OK ? "enabled" : "failed",
                powerLow ? "LOW" : "HIGH", oeLow ? "LOW" : "HIGH");
  return powerHold == ESP_OK && oeHold == ESP_OK && powerLow && oeLow;
#else
  return true;
#endif
}

void setBatteryStatus(int percent, bool isCharging, bool isUsbPresent) {
  g_batteryIsCharging = isCharging;
  g_batteryUsbPresent = isUsbPresent;
  if (percent < 0) {
    g_batteryPercent = -1;
    return;
  }
  if (percent > 100) percent = 100;
  g_batteryPercent = percent;
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

  // The dashboard battery indicator is only visible while USB is connected.
  // Recharge protection uses its own screen and is unaffected.
  if (!g_batteryUsbPresent || g_batteryPercent < 0) return;

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

// Start the firstPage() loop using the full display window.
// The dashboard paints the whole panel so the area outside the configured
// view area always matches the active theme background.
void beginFrameUpdate() {
  g_fullThisCycle = true;
  g_forceFullNext = false;

  display.setFullWindow();
  display.firstPage();
}

bool beginPartialUpdate(int x, int y, int w, int h, bool grayscaleMode) {
  if (grayscaleMode || x < 0 || y < 0 || w <= 0 || h <= 0 ||
      x + w > display.width() || y + h > display.height()) return false;
  g_fullThisCycle = false;
  g_forceFullNext = false;
  // GxEPD2 aligns the controller window as required by the monochrome panel.
  display.setPartialWindow(x, y, w, h);
  display.firstPage();
  return true;
}

bool nextFrameUpdate() {
  return display.nextPage();
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


void drawUpdatingScreen() {
  // Explicit manual updates replace the whole screen with clean feedback.
  // Avoid a partial overlay against an old dashboard, especially on Alfred
  // where the panel controller is reinitialized after its power rail is cut.
  beginFrameUpdate();
  do {
    fillThemeBackground();
    drawCenteredTextInFrame("Updating...", 1);
  } while (nextFrameUpdate());
}


void drawRechargeScreen() {
  display.setFullWindow();
  display.firstPage();
  do {
    fillThemeBackground();
    display.setTextColor(Theme::ink());

    const char* line1 = "Re-Mind";
    const char* line2 = "Recharge now";
    const char* line3 = "Plug in USB to wake the frame";

    int16_t x1, y1;
    uint16_t w, h;

    display.setFont(&FreeMonoBold18pt7b);
    display.getTextBounds(line1, 0, 0, &x1, &y1, &w, &h);
    int titleX = FRAME_X + (FRAME_W - (int)w) / 2;
    int titleY = FRAME_Y + 150;
    display.setCursor(titleX, titleY);
    display.print(line1);

    display.setFont(&FreeMonoBold12pt7b);
    display.getTextBounds(line2, 0, 0, &x1, &y1, &w, &h);
    int rechargeX = FRAME_X + (FRAME_W - (int)w) / 2;
    int rechargeY = titleY + 62;
    display.setCursor(rechargeX, rechargeY);
    display.print(line2);

    display.setFont(&FreeMonoBold9pt7b);
    display.getTextBounds(line3, 0, 0, &x1, &y1, &w, &h);
    int helperX = FRAME_X + (FRAME_W - (int)w) / 2;
    int helperY = FRAME_Y + FRAME_H - 58;
    display.setCursor(helperX, helperY);
    display.print(line3);
  } while (display.nextPage());
}

void drawShelfScreen() {
  display.setFullWindow();
  display.firstPage();
  do {
    fillThemeBackground();
    display.setTextColor(Theme::ink());

    const char* line1 = "RE:MIND";
    const char* line2 = "Welcome";
    const char* line3 = "Plug in the charging cable to begin setup";

    int16_t x1, y1;
    uint16_t w, h;

    // Treat the logo and welcome as one vertically centered group.
    display.setFont(&FreeMonoBold18pt7b);
    display.getTextBounds(line1, 0, 0, &x1, &y1, &w, &h);
    int titleX = FRAME_X + (FRAME_W - (int)w) / 2 - x1;
    int titleY = FRAME_Y + FRAME_H / 2 - 22;
    display.setCursor(titleX, titleY);
    display.print(line1);

    display.setFont(&FreeMonoBold12pt7b);
    display.getTextBounds(line2, 0, 0, &x1, &y1, &w, &h);
    int welcomeX = FRAME_X + (FRAME_W - (int)w) / 2 - x1;
    int welcomeY = titleY + 56;
    display.setCursor(welcomeX, welcomeY);
    display.print(line2);

    // Keep only the first-use instruction near the bottom; never expose
    // manufacturing identifiers or setup internals on the customer screen.
    display.setFont(&FreeMonoBold9pt7b);
    display.getTextBounds(line3, 0, 0, &x1, &y1, &w, &h);
    int infoX = FRAME_X + (FRAME_W - (int)w) / 2 - x1;
    int infoY = FRAME_Y + FRAME_H - 42;
    display.setCursor(infoX, infoY);
    display.print(line3);
  } while (display.nextPage());
}

} // namespace DisplayCore
