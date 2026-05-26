// ScreenPairing.cpp
#include "ScreenPairing.h"
#include "DisplayCore.h"
#include "Config.h"
#include "Theme.h"

#include <Arduino.h>
#include <Fonts/FreeMonoBold9pt7b.h>
#include <Fonts/FreeMonoBold12pt7b.h>
#include <Fonts/FreeMonoBold18pt7b.h>

static void drawCenteredInFrame(const char* text, int y, const GFXfont* font) {
  auto& d = DisplayCore::get();
  d.setFont(font);
  int16_t x1, y1; uint16_t w, h;
  d.getTextBounds(text, 0, 0, &x1, &y1, &w, &h);
  int x = FRAME_X + (FRAME_W - (int)w) / 2 - x1;
  d.setCursor(x, y);
  d.print(text);
}

static void renderPage(void (*cb)(void*), void* ctx) {
  ThemeKey previousTheme = Theme::get();
  Theme::set(THEME_DARK);
  auto& d = DisplayCore::get();
  d.setFullWindow();
  d.firstPage();
  do { d.fillScreen(Theme::paper()); d.setTextColor(Theme::ink()); cb(ctx); } while (d.nextPage());
  Theme::set(previousTheme);
}

namespace ScreenPairing {

struct WifiCtx { const char* ssid; };
static void drawWifiSetup(void* vctx) {
  WifiCtx* ctx = (WifiCtx*)vctx;
  drawCenteredInFrame("In your Wi-Fi settings on your phone, connect to:", FRAME_Y + 110, &FreeMonoBold12pt7b);
  drawCenteredInFrame(ctx->ssid, FRAME_Y + 200, &FreeMonoBold18pt7b);
  drawCenteredInFrame("Add your Wi-Fi credentials", FRAME_Y + 290, &FreeMonoBold12pt7b);
  drawCenteredInFrame("Can take up to a minute for frame to receive your Wi-Fi credentials", FRAME_Y + FRAME_H - 42, &FreeMonoBold9pt7b);
  drawCenteredInFrame("Reconnect charger to restart Wi-Fi setup", FRAME_Y + FRAME_H - 16, &FreeMonoBold9pt7b);
}

void showWifiSetup(const char* ssid) {
  WifiCtx ctx{ ssid };
  renderPage(drawWifiSetup, &ctx);
}

struct PairCtx { const char* code; int expiresInSec; const char* appUrl; };
static void drawPairCode(void* vctx) {
  PairCtx* ctx = (PairCtx*)vctx;
  auto& d = DisplayCore::get();
  drawCenteredInFrame("Login to app and pair frame", FRAME_Y + 60, &FreeMonoBold12pt7b);
  // Placeholder QR region (reserved for uploaded QR bitmap asset)
  const int qrSize = 230;
  const int qrX = FRAME_X + (FRAME_W - qrSize) / 2;
  const int qrY = FRAME_Y + 86;
  d.drawRect(qrX, qrY, qrSize, qrSize, Theme::ink());
  drawCenteredInFrame("re-mind.no", qrY + qrSize + 34, &FreeMonoBold12pt7b);
  drawCenteredInFrame("Pair frame to app by adding code below", qrY + qrSize + 84, &FreeMonoBold12pt7b);
  drawCenteredInFrame("For returning users, \"Pair frame\" can be found in app settings", qrY + qrSize + 112, &FreeMonoBold9pt7b);
  drawCenteredInFrame(ctx->code, qrY + qrSize + 166, &FreeMonoBold18pt7b);
  drawCenteredInFrame("Reconnect charger to restart pairing", FRAME_Y + FRAME_H - 16, &FreeMonoBold9pt7b);
}

void showPairCode(const char* code, int expiresInSec, const char* appUrl) {
  PairCtx ctx{code, expiresInSec, appUrl};
  renderPage(drawPairCode, &ctx);
}

static void drawPaired(void* ctx) { (void)ctx; drawCenteredInFrame("FRAME CONNECTED", FRAME_Y + 150, &FreeMonoBold18pt7b); drawCenteredInFrame("Loading your frame...", FRAME_Y + 230, &FreeMonoBold12pt7b); }
void showPaired() { renderPage(drawPaired, nullptr); }

struct ErrCtx { const char* msg; };
static void drawError(void* vctx) { ErrCtx* ctx=(ErrCtx*)vctx; drawCenteredInFrame("SETUP STOPPED", FRAME_Y + 110, &FreeMonoBold18pt7b); drawCenteredInFrame(ctx->msg, FRAME_Y + 190, &FreeMonoBold12pt7b); drawCenteredInFrame("Restart frame and try again", FRAME_Y + 250, &FreeMonoBold12pt7b); }
void showError(const char* msg) { ErrCtx ctx{msg}; renderPage(drawError,&ctx); }

}
