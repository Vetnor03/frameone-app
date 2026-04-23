// ScreenPairing.cpp
#include "ScreenPairing.h"
#include "DisplayCore.h"
#include "Config.h"

#include <Arduino.h>
#include <Fonts/FreeMonoBold9pt7b.h>
#include <Fonts/FreeMonoBold12pt7b.h>
#include <Fonts/FreeMonoBold18pt7b.h>

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

static void drawLeftInFrame(const char* text, int x, int y, const GFXfont* font) {
  auto& d = DisplayCore::get();
  d.setFont(font);
  d.setCursor(FRAME_X + x, FRAME_Y + y);
  d.print(text);
}

static void drawWrappedLine(const String& line, int x, int& y, int maxW, const GFXfont* font, int lineStep) {
  auto& d = DisplayCore::get();
  d.setFont(font);

  int16_t x1, y1;
  uint16_t w, h;
  d.getTextBounds(line.c_str(), 0, 0, &x1, &y1, &w, &h);

  if ((int)w <= maxW) {
    d.setCursor(FRAME_X + x, FRAME_Y + y);
    d.print(line.c_str());
    y += lineStep;
    return;
  }

  String remaining = line;
  remaining.trim();

  while (remaining.length() > 0) {
    int bestCut = -1;

    for (int i = 1; i <= remaining.length(); i++) {
      String part = remaining.substring(0, i);
      int spacePos = part.lastIndexOf(' ');
      if (spacePos > 0) part = remaining.substring(0, spacePos);

      part.trim();
      if (part.length() == 0) continue;

      d.getTextBounds(part.c_str(), 0, 0, &x1, &y1, &w, &h);
      if ((int)w <= maxW) bestCut = part.length();
      else break;
    }

    if (bestCut <= 0) bestCut = 1;

    String out = remaining.substring(0, bestCut);
    out.trim();

    d.setCursor(FRAME_X + x, FRAME_Y + y);
    d.print(out.c_str());
    y += lineStep;

    remaining = remaining.substring(bestCut);
    remaining.trim();
  }
}

static void drawWrappedBlock(const char* text, int x, int y, int maxW, const GFXfont* font, int lineStep) {
  String s = String(text);
  int yy = y;

  while (s.length() > 0) {
    int nl = s.indexOf('\n');
    if (nl < 0) {
      drawWrappedLine(s, x, yy, maxW, font, lineStep);
      break;
    }

    String one = s.substring(0, nl);
    drawWrappedLine(one, x, yy, maxW, font, lineStep);
    s = s.substring(nl + 1);
  }
}

static int measureTextHeight(const char* text, const GFXfont* font) {
  auto& d = DisplayCore::get();
  d.setFont(font);

  int16_t x1, y1;
  uint16_t w, h;
  d.getTextBounds(text, 0, 0, &x1, &y1, &w, &h);
  return (int)h;
}

typedef void (*DrawCb)(void* ctx);

static void renderPage(DrawCb cb, void* ctx) {
  auto& d = DisplayCore::get();
  d.setFullWindow();
  d.firstPage();
  do {
    d.fillScreen(GxEPD_WHITE);
    d.setTextColor(GxEPD_BLACK);
    DisplayCore::drawFrameBorder();
    cb(ctx);
  } while (d.nextPage());
}

// =======================================================
// Screens
// =======================================================
namespace ScreenPairing {

// ---- WIFI SETUP ----
static void drawWifiSetup(void* ctx) {
  (void)ctx;
  auto& d = DisplayCore::get();

  const int left = 28;
  const int maxW = FRAME_W - (left * 2);

  drawCenteredInFrame("CONNECT TO WIFI", FRAME_Y + 58, &FreeMonoBold18pt7b);

  drawLeftInFrame("ON YOUR PHONE", left, 104, &FreeMonoBold12pt7b);

  int y = 140;
  drawWrappedBlock("1) Join Wi-Fi network FRAME-SETUP", left, y, maxW, &FreeMonoBold12pt7b, 24);
  y += 8;
  drawWrappedBlock("2) Setup page should open", left, y, maxW, &FreeMonoBold12pt7b, 24);
  y += 8;
  drawWrappedBlock("3) If not, open 192.168.4.1", left, y, maxW, &FreeMonoBold12pt7b, 24);
  y += 8;
  drawWrappedBlock("4) Enter home Wi-Fi details", left, y, maxW, &FreeMonoBold12pt7b, 24);

  d.drawLine(FRAME_X + left, FRAME_Y + FRAME_H - 46, FRAME_X + FRAME_W - left, FRAME_Y + FRAME_H - 46, GxEPD_BLACK);

  drawLeftInFrame("KEEP PHONE NEAR FRAME", left, FRAME_H - 20, &FreeMonoBold9pt7b);
}

void showWifiSetup() {
  renderPage(drawWifiSetup, nullptr);
}

// ---- PAIR CODE ----
struct PairCtx {
  const char* code;
  int expiresInSec;
  const char* appUrl;
};

static void drawPairCode(void* vctx) {
  PairCtx* ctx = (PairCtx*)vctx;
  auto& d = DisplayCore::get();

  const int left = 28;
  const int maxW = FRAME_W - (left * 2);
  const int footerLineY = FRAME_Y + FRAME_H - 46;
  const int footerTextY = FRAME_Y + FRAME_H - 18;

  drawCenteredInFrame("PAIR FRAME", FRAME_Y + 58, &FreeMonoBold18pt7b);
  drawLeftInFrame("GO TO", left, 104, &FreeMonoBold12pt7b);

  int y = 144;
  drawWrappedBlock(ctx->appUrl, left, y, maxW, &FreeMonoBold18pt7b, 34);

  y += 32;
  drawWrappedBlock("1) Open the app", left, y, maxW, &FreeMonoBold12pt7b, 30);

  y += 24;
  drawWrappedBlock("2) Log in", left, y, maxW, &FreeMonoBold12pt7b, 30);

  y += 24;
  drawWrappedBlock("3) Tap \"+ ADD FRAME\"", left, y, maxW, &FreeMonoBold12pt7b, 30);

  y += 24;
  drawWrappedBlock("4) Enter this code", left, y, maxW, &FreeMonoBold12pt7b, 30);

  const int instructionBottomY = FRAME_Y + y;
  const int codeTextH = measureTextHeight(ctx->code, &FreeMonoBold18pt7b);

  // Center the code vertically between the bottom of step 4 and the footer divider.
  int gapTop = instructionBottomY + 8;
  int gapBottom = footerLineY - 8;
  int gapMid = gapTop + (gapBottom - gapTop) / 2;

  // drawCenteredInFrame uses baseline Y, so convert from desired visual center.
  int codeBaselineY = gapMid + (codeTextH / 2);
  drawCenteredInFrame(ctx->code, codeBaselineY, &FreeMonoBold18pt7b);

  d.drawLine(FRAME_X + left, footerLineY, FRAME_X + FRAME_W - left, footerLineY, GxEPD_BLACK);

  d.setFont(&FreeMonoBold9pt7b);
  d.setTextColor(GxEPD_BLACK);
  d.setCursor(FRAME_X + left, footerTextY);

  int mins = (ctx->expiresInSec + 59) / 60;
  if (mins < 1) mins = 1;

  d.print("CODE VALID FOR ABOUT ");
  d.print("10");
  d.print(" MIN");
}

void showPairCode(const char* code, int expiresInSec, const char* appUrl) {
  PairCtx ctx;
  ctx.code = code;
  ctx.expiresInSec = expiresInSec;
  ctx.appUrl = appUrl;
  renderPage(drawPairCode, &ctx);
}

// ---- PAIRED ----
static void drawPaired(void* ctx) {
  (void)ctx;

  const int left = 28;
  const int maxW = FRAME_W - (left * 2);

  drawCenteredInFrame("FRAME CONNECTED", FRAME_Y + 150, &FreeMonoBold18pt7b);
  drawWrappedBlock("Loading your frame...", left, 230, maxW, &FreeMonoBold12pt7b, 24);
}

void showPaired() {
  renderPage(drawPaired, nullptr);
}

// ---- ERROR ----
struct ErrCtx {
  const char* msg;
};

static void drawError(void* vctx) {
  ErrCtx* ctx = (ErrCtx*)vctx;

  const int left = 28;
  const int maxW = FRAME_W - (left * 2);

  drawCenteredInFrame("SETUP STOPPED", FRAME_Y + 110, &FreeMonoBold18pt7b);
  drawWrappedBlock(ctx->msg, left, 185, maxW, &FreeMonoBold12pt7b, 24);
  drawWrappedBlock("Restart frame and try again", left, 255, maxW, &FreeMonoBold12pt7b, 24);
}

void showError(const char* msg) {
  ErrCtx ctx;
  ctx.msg = msg;
  renderPage(drawError, &ctx);
}

} // namespace ScreenPairing