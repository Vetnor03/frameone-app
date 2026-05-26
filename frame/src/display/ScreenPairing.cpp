#include "ScreenPairing.h"
#include "DisplayCore.h"
#include "Config.h"
#include "Theme.h"
#include "assets/pairing/PairingQrAsset.h"

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

static int textHeight(const char* text, const GFXfont* font) {
  auto& d = DisplayCore::get();
  d.setFont(font);
  int16_t x1, y1; uint16_t w, h;
  d.getTextBounds(text, 0, 0, &x1, &y1, &w, &h);
  return (int)h;
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

namespace ScreenPairing {
struct WifiCtx { const char* apSsid; };
static void drawWifiSetup(void* vctx) {
  auto* ctx = (WifiCtx*)vctx;
  const int bottomY = FRAME_Y + FRAME_H;
  int y = FRAME_Y + 90;
  drawCenteredInFrame("In your Wi-Fi settings on your phone, connect to:", y, &FreeMonoBold12pt7b);
  y += 70;
  drawCenteredInFrame(ctx->apSsid, y, &FreeMonoBold18pt7b);
  y += 64;
  drawCenteredInFrame("Add your Wi-Fi credentials", y, &FreeMonoBold12pt7b);
  drawCenteredInFrame("Can take up to a minute for frame to receive your Wi-Fi credentials", bottomY - 34, &FreeMonoBold9pt7b);
  drawCenteredInFrame("Reconnect charger to restart Wi-Fi setup", bottomY - 12, &FreeMonoBold9pt7b);
}

void showWifiSetup(const char* apSsid) {
  WifiCtx ctx{apSsid};
  renderPage(drawWifiSetup, &ctx);
}

struct PairCtx { const char* code; };
static void drawPairCode(void* vctx) {
  PairCtx* ctx = (PairCtx*)vctx;
  auto& d = DisplayCore::get();
  const int frameCenterX = FRAME_X + (FRAME_W / 2);

  drawCenteredInFrame("Login to app and pair frame", FRAME_Y + 42, &FreeMonoBold12pt7b);

  const int qrSize = 220;
  const int qrX = frameCenterX - (qrSize / 2);
  const int qrY = FRAME_Y + 58;
  d.drawBitmap(qrX, qrY, PairingQrAsset::kQrMonoBitmap, qrSize, qrSize, Theme::ink());

  drawCenteredInFrame("re-mind.no", qrY + qrSize + 38, &FreeMonoBold12pt7b);
  drawCenteredInFrame("Pair frame to app by adding code below", qrY + qrSize + 74, &FreeMonoBold12pt7b);
  drawCenteredInFrame("For returning users, \"Pair frame\" can be found in app settings", qrY + qrSize + 100, &FreeMonoBold9pt7b);

  const int codeY = FRAME_Y + FRAME_H - 54;
  drawCenteredInFrame(ctx->code, codeY, &FreeMonoBold18pt7b);
  drawCenteredInFrame("Reconnect charger to restart pairing", FRAME_Y + FRAME_H - 12, &FreeMonoBold9pt7b);
}

void showPairCode(const char* code, int expiresInSec, const char* appUrl) {
  (void)expiresInSec; (void)appUrl;
  PairCtx ctx{code};
  renderPage(drawPairCode, &ctx);
}

static void drawPaired(void* ctx) {
  (void)ctx;
  drawCenteredInFrame("FRAME CONNECTED", FRAME_Y + 150, &FreeMonoBold18pt7b);
  drawCenteredInFrame("Loading your frame...", FRAME_Y + 230, &FreeMonoBold12pt7b);
}
void showPaired() { renderPage(drawPaired, nullptr); }

struct ErrCtx { const char* msg; };
static void drawError(void* vctx) {
  ErrCtx* ctx = (ErrCtx*)vctx;
  drawCenteredInFrame("SETUP STOPPED", FRAME_Y + 110, &FreeMonoBold18pt7b);
  drawCenteredInFrame(ctx->msg, FRAME_Y + 185, &FreeMonoBold12pt7b);
  drawCenteredInFrame("Reconnect charger and try again", FRAME_Y + 255, &FreeMonoBold12pt7b);
}
void showError(const char* msg) { ErrCtx ctx{msg}; renderPage(drawError, &ctx); }
}
