// ScreenPairing.cpp
#include "ScreenPairing.h"
#include "DisplayCore.h"
#include "Config.h"
#include "Theme.h"

#include <Arduino.h>
#include <Fonts/FreeMonoBold9pt7b.h>
#include <Fonts/FreeMonoBold12pt7b.h>
#include <Fonts/FreeMonoBold18pt7b.h>
#include "../assets/images/PairingQrBitmap.h"

// =======================================================
// Helpers
// =======================================================
static void drawCenteredInFrame(const char* text, int y, const GFXfont* font) {
  auto& d = DisplayCore::get();
  d.setFont(font);

  int16_t x1, y1;
  uint16_t w, h;
  d.getTextBounds(text, 0, 0, &x1, &y1, &w, &h);

  int x = FRAME_X + (FRAME_W - (int)w) / 2 - x1;
  d.setCursor(x, y);
  d.print(text);
}

typedef void (*DrawCb)(void* ctx);

static void renderPage(DrawCb cb, void* ctx) {
  ThemeKey previousTheme = Theme::get();
  Theme::set(THEME_DARK);

  auto& d = DisplayCore::get();
  d.setFullWindow();
  d.firstPage();
  do {
    d.fillScreen(Theme::paper());
    d.setTextColor(Theme::ink());
    cb(ctx);
  } while (d.nextPage());

  Theme::set(previousTheme);
}

// =======================================================
// Startup screens
// =======================================================
namespace ScreenPairing {

// ---- WIFI SETUP ----
struct WifiCtx {
  const char* ssid;
};

static void drawWifiSetup(void* vctx) {
  WifiCtx* ctx = (WifiCtx*)vctx;

  drawCenteredInFrame("Connect to frame Wi-Fi", FRAME_Y + 76, &FreeMonoBold12pt7b);
  drawCenteredInFrame(ctx->ssid, FRAME_Y + 176, &FreeMonoBold18pt7b);
  drawCenteredInFrame("Open Wi-Fi settings on your phone", FRAME_Y + 258, &FreeMonoBold12pt7b);
  drawCenteredInFrame("After connecting, add your Wi-Fi credentials", FRAME_Y + 326, &FreeMonoBold9pt7b);
  drawCenteredInFrame("Can take up to a minute to receive credentials", FRAME_Y + 386, &FreeMonoBold9pt7b);
  drawCenteredInFrame("Reconnect charger to restart Wi-Fi setup", FRAME_Y + 414, &FreeMonoBold9pt7b);
}

void showWifiSetup(const char* ssid) {
  WifiCtx ctx;
  ctx.ssid = ssid;
  renderPage(drawWifiSetup, &ctx);
}

// ---- PAIR CODE ----
struct PairCtx {
  const char* code;
  int expiresInSec;
  const char* appUrl;
};

static void drawPairCode(void* vctx) {
  PairCtx* ctx = (PairCtx*)vctx;
  (void)ctx->expiresInSec;
  (void)ctx->appUrl;

  auto& d = DisplayCore::get();

  drawCenteredInFrame("Pair your frame", FRAME_Y + 44, &FreeMonoBold12pt7b);

  const int qrX = FRAME_X + (FRAME_W - PairingQrBitmap::WIDTH) / 2;
  const int qrY = FRAME_Y + 70;
  d.drawBitmap(qrX, qrY, PairingQrBitmap::DATA, PairingQrBitmap::WIDTH, PairingQrBitmap::HEIGHT, Theme::ink());

  drawCenteredInFrame("re-mind.no", qrY + PairingQrBitmap::HEIGHT + 28, &FreeMonoBold12pt7b);
  drawCenteredInFrame(ctx->code, qrY + PairingQrBitmap::HEIGHT + 74, &FreeMonoBold18pt7b);
  drawCenteredInFrame("Scan QR, login and enter code in app", FRAME_Y + 386, &FreeMonoBold9pt7b);
  drawCenteredInFrame("Reconnect charger to restart pairing", FRAME_Y + 414, &FreeMonoBold9pt7b);
}

void showPairCode(const char* code, int expiresInSec, const char* appUrl) {
  PairCtx ctx;
  ctx.code = code;
  ctx.expiresInSec = expiresInSec;
  ctx.appUrl = appUrl;
  renderPage(drawPairCode, &ctx);
}

// ---- ERROR ----
struct ErrCtx {
  const char* msg;
};

static void drawError(void* vctx) {
  ErrCtx* ctx = (ErrCtx*)vctx;
  drawCenteredInFrame("SETUP STOPPED", FRAME_Y + 110, &FreeMonoBold18pt7b);
  drawCenteredInFrame(ctx->msg, FRAME_Y + 190, &FreeMonoBold12pt7b);
  drawCenteredInFrame("Restart frame and try again", FRAME_Y + 250, &FreeMonoBold12pt7b);
}

void showError(const char* msg) {
  ErrCtx ctx;
  ctx.msg = msg;
  renderPage(drawError, &ctx);
}

} // namespace ScreenPairing
