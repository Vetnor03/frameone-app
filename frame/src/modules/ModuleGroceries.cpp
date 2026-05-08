#include "ModuleGroceries.h"

#include "DisplayCore.h"
#include "Theme.h"
#include "Config.h"
#include "DeviceIdentity.h"
#include "NetClient.h"

#include "Fonts/FreeSans9ptNO.h"
#include "Fonts/FreeSansBold12ptNO.h"
#include "Fonts/FreeSansBold18ptNO.h"

#include <Arduino.h>
#include <ArduinoJson.h>
#include <time.h>
#include <string.h>
#include <stdio.h>

#define FONT_B9  (&FreeSans9pt8b)
#define FONT_B12 (&FreeSansBold12pt8b)
#define FONT_B18 (&FreeSansBold18pt8b)

namespace ModuleGroceries {

static const FrameConfig* g_cfg = nullptr;

static const int MAX_ITEMS = 40;
static const int MAX_DINNER_ITEMS = 14;
static const int MAX_RUNNING_LOW_INSIGHTS = 3;
static const int MAX_RECIPE_INSIGHTS = 2;
static const int MAX_RECIPE_MISSING = 2;

struct GroceryItem {
  bool used = false;
  char name[48] = {0};
  int qty = 1;
};

struct DinnerPlanItem {
  bool used = false;
  char date[11] = {0};
  char dayLabel[8] = {0};
  char title[48] = {0};
};

struct RunningLowInsight {
  bool used = false;
  char name[40] = {0};
  char label[40] = {0};
};

struct RecipeInsight {
  bool used = false;
  char name[48] = {0};
  int missingCount = 0;
  char missing[MAX_RECIPE_MISSING][32] = {{0}};
};

struct GroceryCache {
  bool loaded = false;
  bool ok = false;
  bool languageNo = false;

  int count = 0;
  GroceryItem items[MAX_ITEMS];

  int dinnerCount = 0;
  DinnerPlanItem dinners[MAX_DINNER_ITEMS];

  int runningLowCount = 0;
  RunningLowInsight runningLow[MAX_RUNNING_LOW_INSIGHTS];

  int recipeCount = 0;
  RecipeInsight recipes[MAX_RECIPE_INSIGHTS];

  char header[64] = {0};
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
        case 0xA9: out[oi++] = (char)0xE9; break;
        default: out[oi++] = '?'; break;
      }

      continue;
    }

    out[oi++] = '?';
  }

  out[oi] = '\0';
}

static void clearCache() {
  g_cache = GroceryCache{};
}

static void measureText(const char* text, const GFXfont* font,
                        int16_t& x1, int16_t& y1, uint16_t& tw, uint16_t& th) {
  auto& d = DisplayCore::get();
  d.setFont(font);
  d.setTextSize(1);
  d.getTextBounds(text ? text : "", 0, 0, &x1, &y1, &tw, &th);
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
  d.print(text ? text : "");
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

  const int srcLen = (int)strlen(src);

  for (int n = srcLen; n >= 1; n--) {
    char buf[80] = {0};
    int take = min(n, (int)sizeof(buf) - 4);

    memcpy(buf, src, take);
    buf[take] = '\0';
    strlcat(buf, "...", sizeof(buf));

    if (textWidth(buf, font) <= maxWidth) {
      safeCopy(dst, dstSize, buf);
      return;
    }
  }

  safeCopy(dst, dstSize, "...");
}

static int fontLineHeight(const GFXfont* font) {
  if (font == FONT_B18) return 24;
  if (font == FONT_B12) return 18;
  return 14;
}

static int getRotationStep4h() {
  time_t now = time(nullptr);
  if (now <= 0) return 0;
  return (int)(now / (4 * 3600));
}

static int wrapIndex(int idx, int count) {
  if (count <= 0) return 0;
  while (idx < 0) idx += count;
  while (idx >= count) idx -= count;
  return idx;
}

static bool parseYmd10(const char* s, int& y, int& m, int& d) {
  if (!s || strlen(s) < 10 || s[4] != '-' || s[7] != '-') return false;

  for (int i = 0; i < 10; i++) {
    if (i == 4 || i == 7) continue;
    if (s[i] < '0' || s[i] > '9') return false;
  }

  y = (s[0] - '0') * 1000 + (s[1] - '0') * 100 + (s[2] - '0') * 10 + (s[3] - '0');
  m = (s[5] - '0') * 10 + (s[6] - '0');
  d = (s[8] - '0') * 10 + (s[9] - '0');

  return y >= 1970 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
}

static void dinnerDayLabel(const char* ymd, char* out, size_t outSize) {
  if (!out || outSize == 0) return;

  safeCopy(out, outSize, "Day");

  int y = 0;
  int m = 0;
  int d = 0;

  if (!parseYmd10(ymd, y, m, d)) return;

  struct tm tmv = {};
  tmv.tm_year = y - 1900;
  tmv.tm_mon = m - 1;
  tmv.tm_mday = d;
  tmv.tm_hour = 12;

  if (mktime(&tmv) == (time_t)-1) return;

  static const char* labels[] = {"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"};
  safeCopy(out, outSize, labels[tmv.tm_wday]);
}

static const char* emptyPhrase() {
  return g_cache.languageNo ? "Alt er klart" : "All set";
}

static void formatItem(const GroceryItem& item, char* out, size_t outSize) {
  if (!out || outSize == 0) return;

  if (item.qty > 1) {
    snprintf(out, outSize, "%dx %s", item.qty, item.name);
  } else {
    safeCopy(out, outSize, item.name);
  }
}

static int drawHeader(const Cell& c, const char* header, int topPad, const GFXfont* font) {
  auto& d = DisplayCore::get();
  const uint16_t ink = Theme::ink();

  char fit[64] = {0};
  fitTextToWidth(header, fit, sizeof(fit), c.w - 24, font);

  int16_t x1, y1;
  uint16_t tw, th;
  measureText(fit, font, x1, y1, tw, th);

  int baseline = c.y + topPad - y1;
  int x = c.x + c.w / 2 - (int)tw / 2 - x1;

  d.setFont(font);
  d.setTextSize(1);
  d.setTextColor(ink);
  d.setCursor(x, baseline);
  d.print(fit);
  d.setFont(nullptr);

  int underlineY = baseline + y1 + (int)th + 2;
  d.fillRect(c.x + c.w / 2 - (int)tw / 2, underlineY, tw, 2, ink);

  return underlineY + 12;
}

static void drawEmptyState(const Cell& c, const char* line1, const char* line2) {
  const uint16_t ink = Theme::ink();

  int w1 = textWidth(line1, FONT_B12);
  int w2 = textWidth(line2, FONT_B9);

  int cy = c.y + c.h / 2;

  drawLeft(c.x + c.w / 2 - w1 / 2, cy - 4, line1, FONT_B12, ink);
  drawLeft(c.x + c.w / 2 - w2 / 2, cy + 22, line2, FONT_B9, ink);
}

static bool fetchGroceries() {
  Serial.println("🛒 FETCH 1: entered");
  Serial.print("Free heap at fetch start: ");
  Serial.println(ESP.getFreeHeap());

  clearCache();

  Serial.println("🛒 FETCH 2: cache cleared");

  String url = String(BASE_URL) + "/api/device/groceries?device_id=" + DeviceIdentity::getDeviceId();

  int code = 0;
  String body;

  Serial.println("🛒 FETCH 3: before HTTP");
  Serial.println(url);

  bool httpOk = NetClient::httpGetAuth(url, DeviceIdentity::getToken(), code, body);

  Serial.print("🛒 FETCH 4: after HTTP, ok=");
  Serial.print(httpOk ? "true" : "false");
  Serial.print(" code=");
  Serial.println(code);

  Serial.print("Body length: ");
  Serial.println(body.length());

  Serial.print("Free heap after HTTP: ");
  Serial.println(ESP.getFreeHeap());

  if (!httpOk || code != 200) {
    Serial.println("❌ Groceries HTTP failed");

    g_cache.loaded = true;
    g_cache.ok = false;
    return false;
  }

  Serial.println("🛒 FETCH 5: before JSON parse");

  DynamicJsonDocument doc(8192);

  DeserializationError err = deserializeJson(doc, body);

  Serial.println("🛒 FETCH 6: after JSON parse");

  body = String();

  Serial.print("Free heap after body free: ");
  Serial.println(ESP.getFreeHeap());

  if (err) {
    Serial.print("❌ Groceries JSON parse failed: ");
    Serial.println(err.c_str());

    g_cache.loaded = true;
    g_cache.ok = false;
    return false;
  }

  Serial.print("JSON memory used: ");
  Serial.println(doc.memoryUsage());

  bool ok = doc["ok"] | false;
  if (!ok) {
    Serial.println("❌ Groceries endpoint returned ok=false");

    g_cache.loaded = true;
    g_cache.ok = false;
    return false;
  }

  const char* language = doc["language"] | "en";
  g_cache.languageNo = language && (
    strcmp(language, "no") == 0 ||
    strcmp(language, "nb") == 0 ||
    strcmp(language, "nb-NO") == 0
  );

  safeCopy(g_cache.header, sizeof(g_cache.header), g_cache.languageNo ? "Handleliste" : "Grocery List");

  Serial.println("🛒 FETCH 7: parse items");

  JsonArray items = doc["items"].as<JsonArray>();
  int idx = 0;

  if (!items.isNull()) {
    for (JsonObject it : items) {
      if (idx >= MAX_ITEMS) break;

      const char* nm = it["name"] | it["label"] | "";
      if (!nm || !nm[0]) continue;

      g_cache.items[idx].used = true;
      utf8ToLatin1(g_cache.items[idx].name, sizeof(g_cache.items[idx].name), nm);
      g_cache.items[idx].qty = max(1, (int)(it["quantity"] | it["qty"] | 1));

      idx++;
    }
  }

  g_cache.count = idx;

  Serial.println("🛒 FETCH 8: parse dinner plan");

  JsonArray dinners = doc["dinner_plan"].as<JsonArray>();
  int dinnerIdx = 0;

  if (!dinners.isNull()) {
    for (JsonObject it : dinners) {
      if (dinnerIdx >= MAX_DINNER_ITEMS) break;

      const char* date = it["date"] | "";
      const char* title = it["title"] | it["name"] | it["dish"] | it["meal"] | "";

      if (!date || !date[0] || !title || !title[0]) continue;

      g_cache.dinners[dinnerIdx].used = true;
      safeCopy(g_cache.dinners[dinnerIdx].date, sizeof(g_cache.dinners[dinnerIdx].date), date);
      dinnerDayLabel(date, g_cache.dinners[dinnerIdx].dayLabel, sizeof(g_cache.dinners[dinnerIdx].dayLabel));
      utf8ToLatin1(g_cache.dinners[dinnerIdx].title, sizeof(g_cache.dinners[dinnerIdx].title), title);

      dinnerIdx++;
    }
  }

  g_cache.dinnerCount = dinnerIdx;

  Serial.println("🛒 FETCH 9: parse running low");

  JsonArray runningLow = doc["insights"]["running_low"].as<JsonArray>();
  int runningIdx = 0;

  if (!runningLow.isNull()) {
    for (JsonObject it : runningLow) {
      if (runningIdx >= MAX_RUNNING_LOW_INSIGHTS) break;

      const char* nm = it["name"] | "";
      const char* label = it["label"] | "";

      if (!nm || !nm[0]) continue;

      g_cache.runningLow[runningIdx].used = true;
      utf8ToLatin1(g_cache.runningLow[runningIdx].name, sizeof(g_cache.runningLow[runningIdx].name), nm);
      utf8ToLatin1(g_cache.runningLow[runningIdx].label, sizeof(g_cache.runningLow[runningIdx].label), label && label[0] ? label : "Low soon");

      runningIdx++;
    }
  }

  g_cache.runningLowCount = runningIdx;

  Serial.println("🛒 FETCH 10: parse recipes");

  JsonArray recipes = doc["insights"]["recipes"].as<JsonArray>();
  int recipeIdx = 0;

  if (!recipes.isNull()) {
    for (JsonObject it : recipes) {
      if (recipeIdx >= MAX_RECIPE_INSIGHTS) break;

      const char* nm = it["name"] | "";
      if (!nm || !nm[0]) continue;

      g_cache.recipes[recipeIdx].used = true;
      utf8ToLatin1(g_cache.recipes[recipeIdx].name, sizeof(g_cache.recipes[recipeIdx].name), nm);

      JsonArray missing = it["missing"].as<JsonArray>();
      int missingIdx = 0;

      if (!missing.isNull()) {
        for (JsonVariant mv : missing) {
          if (missingIdx >= MAX_RECIPE_MISSING) break;

          const char* missingName = mv | "";
          if (!missingName || !missingName[0]) continue;

          utf8ToLatin1(
            g_cache.recipes[recipeIdx].missing[missingIdx],
            sizeof(g_cache.recipes[recipeIdx].missing[missingIdx]),
            missingName
          );

          missingIdx++;
        }
      }

      g_cache.recipes[recipeIdx].missingCount = missingIdx;

      recipeIdx++;
    }
  }

  g_cache.recipeCount = recipeIdx;

  Serial.print("🛒 FETCH DONE items=");
  Serial.print(g_cache.count);
  Serial.print(" dinners=");
  Serial.print(g_cache.dinnerCount);
  Serial.print(" runningLow=");
  Serial.print(g_cache.runningLowCount);
  Serial.print(" recipes=");
  Serial.println(g_cache.recipeCount);

  Serial.print("Free heap at fetch end: ");
  Serial.println(ESP.getFreeHeap());

  g_cache.loaded = true;
  g_cache.ok = true;

  return true;
}

static void ensureLoaded() {
  if (!g_cache.loaded) fetchGroceries();
}

static void drawSimpleList(const Cell& c, int maxItems, const GFXfont* font) {
  const uint16_t ink = Theme::ink();
  auto& d = DisplayCore::get();

  int contentTop = drawHeader(c, g_cache.header, 28, FONT_B12);

  if (g_cache.count <= 0) {
    Cell body = c;
    body.y = contentTop;
    body.h = c.y + c.h - contentTop;
    drawEmptyState(body, "All set", emptyPhrase());
    return;
  }

  int visibleCount = min(g_cache.count, maxItems);
  int rotation = getRotationStep4h();

  int lineH = (font == FONT_B12) ? 28 : 22;
  int startY = contentTop + 24;
  int padX = 18;

  for (int i = 0; i < visibleCount; i++) {
    int idx = wrapIndex(rotation + i, g_cache.count);

    char raw[72] = {0};
    formatItem(g_cache.items[idx], raw, sizeof(raw));

    char fit[72] = {0};
    fitTextToWidth(raw, fit, sizeof(fit), c.w - padX * 2 - 24, font);

    int y = startY + i * lineH;
    if (y > c.y + c.h - 14) break;

    d.fillCircle(c.x + padX, y - 5, 3, ink);
    drawLeft(c.x + padX + 16, y, fit, font, ink);
  }

  if (g_cache.count > visibleCount) {
    char moreBuf[32] = {0};
    snprintf(moreBuf, sizeof(moreBuf), "+%d more", g_cache.count - visibleCount);

    int w = textWidth(moreBuf, FONT_B9);
    drawLeft(c.x + c.w / 2 - w / 2, c.y + c.h - 18, moreBuf, FONT_B9, ink);
  }
}

static void renderSmall(const Cell& c) {
  drawSimpleList(c, 3, FONT_B9);
}

static void renderMedium(const Cell& c) {
  drawSimpleList(c, 6, FONT_B9);
}

static void renderLarge(const Cell& c) {
  drawSimpleList(c, 10, FONT_B12);
}

static void renderXL(const Cell& c) {
  drawSimpleList(c, 12, FONT_B12);
}

void setConfig(const FrameConfig* cfg) {
  g_cfg = cfg;
  (void)g_cfg;
  g_cache.loaded = false;
}

void render(const Cell& c, const String& moduleName) {
  (void)moduleName;

  Serial.println("🛒 RENDER: groceries render entered");
  Serial.print("Free heap before ensureLoaded: ");
  Serial.println(ESP.getFreeHeap());

  ensureLoaded();

  Serial.print("Free heap after ensureLoaded: ");
  Serial.println(ESP.getFreeHeap());

  if (!g_cache.ok) {
    drawEmptyState(c, "Grocery List", "Fetch failed");
    Serial.println("🛒 RENDER: fetch failed");
    return;
  }

  Serial.print("Groceries count: ");
  Serial.println(g_cache.count);
  Serial.print("Dinner count: ");
  Serial.println(g_cache.dinnerCount);

  switch (c.size) {
    case CELL_SMALL:  renderSmall(c); break;
    case CELL_MEDIUM: renderMedium(c); break;
    case CELL_LARGE:  renderLarge(c); break;
    case CELL_XL:     renderXL(c); break;
    default:          renderMedium(c); break;
  }

  Serial.println("🛒 RENDER: groceries render done");
}

} // namespace ModuleGroceries
