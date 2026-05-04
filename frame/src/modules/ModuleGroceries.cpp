#include "ModuleGroceries.h"

#include "DisplayCore.h"
#include "Theme.h"
#include "Config.h"
#include "DeviceIdentity.h"
#include "NetClient.h"

#include "Fonts/FreeSans9ptNO.h"
#include "Fonts/FreeSansBold12ptNO.h"

#include <ArduinoJson.h>
#include <time.h>
#include <string.h>

#define FONT_B9  (&FreeSans9pt8b)
#define FONT_B12 (&FreeSansBold12pt8b)

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

static void drawLeft(int x, int baselineY, const char* text, const GFXfont* font, uint16_t color) {
  auto& d = DisplayCore::get();
  d.setFont(font);
  d.setTextSize(1);
  d.setTextColor(color);
  d.setCursor(x, baselineY);
  d.print(text);
  d.setFont(nullptr);
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
    char buf[128] = {0};
    int take = n;
    if (take > (int)sizeof(buf) - 4) take = (int)sizeof(buf) - 4;

    memcpy(buf, src, take);
    buf[take] = 0;
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
    } else if (todayNode.is<const char*>()) {
      const char* title = todayNode.as<const char*>();
      if (title && title[0]) { safeCopy(out, outSize, title); return true; }
    }
  }

  return false;
}

static const char* emptyPhrase() {
  static const char* phrases[] = {
    "Fridge is stacked",
    "Pantry looks good",
    "No grocery runs needed",
    "Kitchen is covered"
  };
  int r = getRotationStep4h();
  return phrases[r % 4];
}

static void clearCache() {
  g_cache = GroceryCache{};
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

      g_cache.items[idx].used = true;
      safeCopy(g_cache.items[idx].name, sizeof(g_cache.items[idx].name), nm);
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
    char titleFit[80] = {0};
    fitTextToWidth(dinnerTitle, titleFit, sizeof(titleFit), 220, FONT_B12);
    snprintf(g_cache.header, sizeof(g_cache.header), "Today: %s", titleFit);
  } else {
    safeCopy(g_cache.header, sizeof(g_cache.header), "Grocery List");
  }

  g_cache.ok = true;
  g_cache.loaded = true;
  return true;
}

static void ensureLoaded() {
  if (!g_cache.loaded) fetchGroceries();
}

static void drawListLines(const Cell& c, int startY, int maxLines) {
  const int padX = 12;
  const int lineStep = 16;

  if (g_cache.count <= 0) {
    drawLeft(c.x + padX, startY + lineStep, emptyPhrase(), FONT_B9, Theme::ink());
    return;
  }

  int r = getRotationStep4h();
  int show = min(maxLines, g_cache.count);

  for (int i = 0; i < show; i++) {
    int idx = (r + i) % g_cache.count;

    char raw[120] = {0};
    if (g_cache.items[idx].qty > 1) {
      snprintf(raw, sizeof(raw), "%s x%d", g_cache.items[idx].name, g_cache.items[idx].qty);
    } else {
      safeCopy(raw, sizeof(raw), g_cache.items[idx].name);
    }

    char line[120] = {0};
    fitTextToWidth(raw, line, sizeof(line), c.w - (padX * 2), FONT_B9);
    drawLeft(c.x + padX, startY + ((i + 1) * lineStep), line, FONT_B9, Theme::ink());
  }

  if (g_cache.count > show) {
    char more[32] = {0};
    snprintf(more, sizeof(more), "+%d items", g_cache.count - show);

    int rightX = c.x + c.w - 88;
    drawLeft(rightX, startY + ((show + 1) * lineStep), more, FONT_B9, Theme::ink());
  }
}

// -----------------------------------------------------------------------------
// Module-size specific renderers (same pattern as other modules)
// -----------------------------------------------------------------------------
static void renderSmall(const Cell& c) {
  char header[96] = {0};
  fitTextToWidth(g_cache.header, header, sizeof(header), c.w - 24, FONT_B12);
  drawLeft(c.x + 12, c.y + 24, header, FONT_B12, Theme::ink());

  drawListLines(c, c.y + 28, 2);
}

static void renderMedium(const Cell& c) {
  char header[96] = {0};
  fitTextToWidth(g_cache.header, header, sizeof(header), c.w - 24, FONT_B12);
  drawLeft(c.x + 12, c.y + 24, header, FONT_B12, Theme::ink());

  drawListLines(c, c.y + 30, 5);
}

static void renderLarge(const Cell& c) {
  int leftW = (c.w - 8) / 2;

  Cell left{c.x, c.y, leftW, c.h, c.slot, c.size};
  Cell right{c.x + leftW + 8, c.y, c.w - leftW - 8, c.h, c.slot, c.size};

  renderMedium(left);
  drawListLines(right, right.y + 12, 8);
}

static void renderXL(const Cell& c) {
  int topH = (c.h - 8) / 2;

  Cell top{c.x, c.y, c.w, topH, c.slot, c.size};
  Cell bottom{c.x, c.y + topH + 8, c.w, c.h - topH - 8, c.slot, c.size};

  renderMedium(top);
  drawListLines(bottom, bottom.y + 8, 8);
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
    drawLeft(c.x + 12, c.y + 24, "Groceries unavailable", FONT_B9, Theme::ink());
    return;
  }

  switch (c.size) {
    case CELL_SMALL:  renderSmall(c); break;
    case CELL_MEDIUM: renderMedium(c); break;
    case CELL_LARGE:  renderLarge(c); break;
    case CELL_XL:     renderXL(c); break;
    default:          renderMedium(c); break;
  }
}

} // namespace ModuleGroceries
