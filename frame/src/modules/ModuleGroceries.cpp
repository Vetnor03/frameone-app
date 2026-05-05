#include "ModuleGroceries.h"

#include "DisplayCore.h"
#include "Theme.h"
#include "Config.h"
#include "DeviceIdentity.h"
#include "NetClient.h"

#include "Fonts/FreeSans9ptNO.h"
#include "Fonts/FreeSansBold12ptNO.h"
#include "Fonts/FreeSansBold18ptNO.h"

#include <ArduinoJson.h>
#include <time.h>
#include <string.h>

#define FONT_B9  (&FreeSans9pt8b)
#define FONT_B12 (&FreeSansBold12pt8b)
#define FONT_B18 (&FreeSansBold18pt8b)

namespace ModuleGroceries {

static const FrameConfig* g_cfg = nullptr;
static const int MAX_ITEMS = 40;

struct GroceryItem {
  bool used = false;
  char name[80] = {0};
  int qty = 1;
};

struct GroceryCache {
  bool loaded = false;
  bool ok = false;
  int count = 0;
  GroceryItem items[MAX_ITEMS];
  char header[96] = {0};
};

static GroceryCache g_cache;

static void safeCopy(char* dst, size_t dstSize, const char* src) {
  if (!dst || dstSize == 0) return;
  if (!src) {
    dst[0] = '\0';
    return;
  }
  strlcpy(dst, src, dstSize);
}

static void utf8ToLatin1(char* out, size_t n, const char* in) {
  if (!out || n == 0) return;
  size_t oi = 0;
  for (size_t i = 0; in && in[i] && oi + 1 < n; i++) {
    uint8_t c = (uint8_t)in[i];
    if (c < 0x80) {
      out[oi++] = (char)c;
      continue;
    }
    if (c == 0xC3 && in[i + 1]) {
      uint8_t d = (uint8_t)in[i + 1];
      i++;
      switch (d) {
        case 0xB8: out[oi++] = (char)0xF8; break;
        case 0x98: out[oi++] = (char)0xD8; break;
        case 0xA5: out[oi++] = (char)0xE5; break;
        case 0x85: out[oi++] = (char)0xC5; break;
        case 0xA6: out[oi++] = (char)0xE6; break;
        case 0x86: out[oi++] = (char)0xC6; break;
        default: out[oi++] = '?'; break;
      }
      continue;
    }
    out[oi++] = '?';
  }
  out[oi] = 0;
}

static void measureText(const char* text, const GFXfont* font,
                        int16_t& x1, int16_t& y1, uint16_t& tw, uint16_t& th) {
  auto& d = DisplayCore::get();
  d.setFont(font);
  d.setTextSize(1);
  d.getTextBounds(text, 0, 0, &x1, &y1, &tw, &th);
}

static int textWidth(const char* text, const GFXfont* font) {
  int16_t x1, y1;
  uint16_t tw, th;
  measureText(text, font, x1, y1, tw, th);
  return (int)tw;
}

static int fontLineHeight(const GFXfont* font) {
  if (font == FONT_B18) return 24;
  if (font == FONT_B12) return 18;
  return 14;
}

static void drawLeft(int x, int baselineY, const char* text, const GFXfont* font, uint16_t color) {
  auto& d = DisplayCore::get();
  d.setFont(font);
  d.setTextSize(1);
  d.setTextColor(color);
  d.setCursor(x, baselineY);
  d.print(text);
  d.setFont(nullptr);
}

static void drawCenteredLine(int x, int y, int w, int h, const char* text, const GFXfont* font, uint16_t color) {
  int16_t x1, y1;
  uint16_t tw, th;
  measureText(text, font, x1, y1, tw, th);
  int bx = x + (w - (int)tw) / 2;
  int by = y + (h - (int)th) / 2;
  drawLeft(bx - x1, by - y1, text, font, color);
}

static void fitTextToWidth(const char* src, char* dst, size_t dstSize, int maxWidth, const GFXfont* font) {
  if (!dst || dstSize == 0) return;
  dst[0] = '\0';
  if (!src || !src[0]) return;
  if (textWidth(src, font) <= maxWidth) {
    safeCopy(dst, dstSize, src);
    return;
  }

  for (int n = (int)strlen(src); n >= 1; n--) {
    char buf[160] = {0};
    int take = n;
    if (take > (int)sizeof(buf) - 4) take = (int)sizeof(buf) - 4;
    memcpy(buf, src, take);
    buf[take] = '\0';
    strcat(buf, "...");
    if (textWidth(buf, font) <= maxWidth) {
      safeCopy(dst, dstSize, buf);
      return;
    }
  }
  safeCopy(dst, dstSize, "...");
}

static int getRotationStep4h() {
  time_t now = time(nullptr);
  if (now <= 0) return 0;
  return (int)(now / (4 * 3600));
}

static void drawEmptyState(const Cell& c, const char* line1, const char* line2) {
  const GFXfont* f1 = FONT_B12;
  const GFXfont* f2 = FONT_B9;
  int lh1 = fontLineHeight(f1);
  int lh2 = fontLineHeight(f2);
  int total = lh1 + 6 + lh2;
  int top = c.y + (c.h - total) / 2;
  drawCenteredLine(c.x, top, c.w, lh1, line1, f1, Theme::ink());
  drawCenteredLine(c.x, top + lh1 + 6, c.w, lh2, line2, f2, Theme::ink());
}

static void drawCenteredBulletLine(int cx, int baselineY, const char* text, int maxTextWidth) {
  char fit[140] = {0};
  fitTextToWidth(text, fit, sizeof(fit), maxTextWidth, FONT_B9);
  int txtW = textWidth(fit, FONT_B9);
  int gap = 8;
  int dotR = 2;
  int rowW = dotR * 2 + gap + txtW;
  int rowX = cx - (rowW / 2);

  auto& d = DisplayCore::get();
  d.fillCircle(rowX + dotR, baselineY - 5, dotR, Theme::ink());
  drawLeft(rowX + dotR * 2 + gap, baselineY, fit, FONT_B9, Theme::ink());
}

static const char* emptyPhrase() {
  static const char* phrases[] = {
    "Kj\xF8leskapet er fullt",
    "Alt er handlet",
    "Ingen varer mangler",
    "Kj\xF8kkenet er klart"
  };
  return phrases[getRotationStep4h() % 4];
}

static bool getTodayYmd(char* out, size_t outSize) {
  if (!out || outSize < 11) return false;
  time_t now = time(nullptr);
  if (now <= 0) return false;
  struct tm tmv;
  localtime_r(&now, &tmv);
  strftime(out, outSize, "%Y-%m-%d", &tmv);
  return true;
}

static bool extractTodayDinnerTitle(JsonVariant src, const char* todayYmd, char* out, size_t outSize) {
  if (!todayYmd || !todayYmd[0] || src.isNull()) return false;
  if (src.is<JsonArray>()) {
    for (JsonVariant v : src.as<JsonArray>()) {
      if (!v.is<JsonObject>()) continue;
      JsonObject o = v.as<JsonObject>();
      const char* date = o["date"] | o["day"] | o["planned_date"] | "";
      if (!date || strcmp(date, todayYmd) != 0) continue;
      const char* title = o["title"] | o["name"] | o["dish"] | o["meal"] | "";
      if (title && title[0]) { safeCopy(out, outSize, title); return true; }
    }
  }
  if (src.is<JsonObject>()) {
    JsonObject obj = src.as<JsonObject>();
    JsonVariant todayNode = obj[todayYmd];
    if (todayNode.is<JsonObject>()) {
      const char* title = todayNode["title"] | todayNode["name"] | todayNode["dish"] | todayNode["meal"] | "";
      if (title && title[0]) { safeCopy(out, outSize, title); return true; }
    }
  }
  return false;
}

static void clearCache() { g_cache = GroceryCache{}; }

static void formatItemLine(const GroceryItem& item, char* out, size_t outSize) {
  if (item.qty > 1) snprintf(out, outSize, "%d\xD7 %s", item.qty, item.name);
  else safeCopy(out, outSize, item.name);
}

static bool fetchGroceries() {
  clearCache();
  String url = String(BASE_URL) + "/api/device/frame-config?device_id=" + DeviceIdentity::getDeviceId();
  int code = 0;
  String body;
  if (!NetClient::httpGetAuth(url, DeviceIdentity::getToken(), code, body) || code != 200) {
    g_cache.loaded = true;
    return false;
  }

  StaticJsonDocument<16384> doc;
  if (deserializeJson(doc, body)) {
    g_cache.loaded = true;
    return false;
  }

  JsonArray arr = doc["settings_json"]["modules"]["groceries"].as<JsonArray>();
  int idx = 0;
  if (!arr.isNull()) {
    for (JsonObject it : arr) {
      if (idx >= MAX_ITEMS) break;
      const char* nm = it["name"] | "";
      if (!nm || !nm[0]) continue;
      char latin[80] = {0};
      utf8ToLatin1(latin, sizeof(latin), nm);
      g_cache.items[idx].used = true;
      safeCopy(g_cache.items[idx].name, sizeof(g_cache.items[idx].name), latin);
      g_cache.items[idx].qty = max(1, (int)(it["quantity"] | 1));
      idx++;
    }
  }
  g_cache.count = idx;

  char todayYmd[16] = {0};
  char dinnerTitle[80] = {0};
  bool hasTodayDinner = false;
  if (getTodayYmd(todayYmd, sizeof(todayYmd))) {
    hasTodayDinner =
      extractTodayDinnerTitle(doc["settings_json"]["modules"]["dinnerPlanner"], todayYmd, dinnerTitle, sizeof(dinnerTitle)) ||
      extractTodayDinnerTitle(doc["settings_json"]["modules"]["dinner_planner"], todayYmd, dinnerTitle, sizeof(dinnerTitle)) ||
      extractTodayDinnerTitle(doc["settings_json"]["modules"]["dinner"], todayYmd, dinnerTitle, sizeof(dinnerTitle)) ||
      extractTodayDinnerTitle(doc["settings_json"]["dinnerPlanner"], todayYmd, dinnerTitle, sizeof(dinnerTitle)) ||
      extractTodayDinnerTitle(doc["settings_json"]["dinner_planner"], todayYmd, dinnerTitle, sizeof(dinnerTitle));
  }

  if (hasTodayDinner) {
    char latin[80] = {0};
    utf8ToLatin1(latin, sizeof(latin), dinnerTitle);
    char fit[80] = {0};
    fitTextToWidth(latin, fit, sizeof(fit), 210, FONT_B12);
    snprintf(g_cache.header, sizeof(g_cache.header), "Middag i dag: %s", fit);
  } else {
    safeCopy(g_cache.header, sizeof(g_cache.header), "Handleliste");
  }

  g_cache.ok = true;
  g_cache.loaded = true;
  return true;
}

static void ensureLoaded() { if (!g_cache.loaded) fetchGroceries(); }

static void drawHeader(const Cell& c) {
  drawCenteredLine(c.x, c.y + 4, c.w, 20, g_cache.header, FONT_B12, Theme::ink());
  auto& d = DisplayCore::get();
  int uw = min(120, max(40, textWidth(g_cache.header, FONT_B9) / 2));
  int ux = c.x + (c.w - uw) / 2;
  int uy = c.y + 24;
  d.drawFastHLine(ux, uy, uw, Theme::ink());
}

static void drawListInColumn(const Cell& c, int startIdx, int maxRows, bool showMoreTopRight, int rotationStart) {
  int show = min(maxRows, max(0, g_cache.count - startIdx));
  int lineStart = c.y + 42;
  int lineStep = 17;
  int cx = c.x + c.w / 2;

  for (int i = 0; i < show; i++) {
    char line[120] = {0};
    int idx = (rotationStart + startIdx + i) % g_cache.count;
    formatItemLine(g_cache.items[idx], line, sizeof(line));
    drawCenteredBulletLine(cx, lineStart + (i * lineStep), line, c.w - 34);
  }

  if (showMoreTopRight) {
    int hidden = g_cache.count - (startIdx + show);
    if (hidden > 0) {
      char more[32] = {0};
      snprintf(more, sizeof(more), "+%d varer", hidden);
      drawLeft(c.x + c.w - textWidth(more, FONT_B9) - 4, c.y + 18, more, FONT_B9, Theme::ink());
    }
  }
}

static void renderSmall(const Cell& c) {
  drawHeader(c);
  if (g_cache.count <= 0) {
    drawEmptyState(c, g_cache.header, emptyPhrase());
    return;
  }
  int start = getRotationStep4h() % g_cache.count;
  drawListInColumn(c, 0, 3, true, start);
}

static void renderMedium(const Cell& c) {
  drawHeader(c);
  if (g_cache.count <= 0) {
    drawEmptyState(c, g_cache.header, emptyPhrase());
    return;
  }
  int start = getRotationStep4h() % g_cache.count;
  drawListInColumn(c, 0, 5, true, start);
}

static void renderLarge(const Cell& c) {
  drawHeader(c);
  if (g_cache.count <= 0) {
    drawEmptyState(c, g_cache.header, emptyPhrase());
    return;
  }
  int start = getRotationStep4h() % g_cache.count;

  int gap = 10;
  int colW = (c.w - gap) / 2;
  Cell left{c.x, c.y, colW, c.h, c.slot, c.size};
  Cell right{c.x + colW + gap, c.y, c.w - colW - gap, c.h, c.slot, c.size};
  drawListInColumn(left, 0, 5, true, start);
  drawListInColumn(right, 5, 7, false, start);
}

static void renderXL(const Cell& c) {
  drawHeader(c);
  if (g_cache.count <= 0) {
    drawEmptyState(c, g_cache.header, emptyPhrase());
    return;
  }
  int start = getRotationStep4h() % g_cache.count;

  int colGap = 10;
  int rowGap = 10;
  int leftW = (c.w * 52) / 100;
  Cell topLeft{c.x, c.y + 4, leftW, (c.h - rowGap) / 2, c.slot, c.size};
  Cell bottomLeft{c.x, c.y + topLeft.h + rowGap, leftW, c.h - topLeft.h - rowGap, c.slot, c.size};
  Cell right{c.x + leftW + colGap, c.y + 4, c.w - leftW - colGap, c.h - 4, c.slot, c.size};

  drawListInColumn(topLeft, 0, 5, true, start);
  drawListInColumn(bottomLeft, 5, 5, false, start);
  drawListInColumn(right, 10, 12, false, start);
}

void setConfig(const FrameConfig* cfg) {
  g_cfg = cfg;
  (void)g_cfg;
  g_cache.loaded = false;
}

void render(const Cell& c, const String& moduleName) {
  (void)moduleName;
  ensureLoaded();
  if (!g_cache.ok) {
    drawEmptyState(c, "Handleliste", "Kunne ikke hente varer");
    return;
  }

  switch (c.size) {
    case CELL_SMALL: renderSmall(c); break;
    case CELL_MEDIUM: renderMedium(c); break;
    case CELL_LARGE: renderLarge(c); break;
    case CELL_XL: renderXL(c); break;
    default: renderMedium(c); break;
  }
}

} // namespace ModuleGroceries
