#include "FrameText.h"
#include "ModuleGroceries.h"

#include "DisplayCore.h"
#include "Theme.h"
#include "Config.h"
#include "DeviceIdentity.h"
#include "NetClient.h"
#include "GroceriesAdaptivePolicy.h"

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
  FrameText::normalizeUtf8ForDisplay(out, n, in);
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

static void drawHeaderEmptyLine(const Cell& c, int contentTop, const char* text) {
  const uint16_t ink = Theme::ink();

  char fit[64] = {0};
  fitTextToWidth(text, fit, sizeof(fit), c.w - 32, FONT_B9);

  int w = textWidth(fit, FONT_B9);
  int lineH = fontLineHeight(FONT_B9);
  int y = contentTop + 6 + lineH;

  drawLeft(c.x + c.w / 2 - w / 2, y, fit, FONT_B9, ink);
}

static bool fetchGroceries() {
  clearCache();

  String url = String(BASE_URL) + "/api/device/groceries?device_id=" + DeviceIdentity::getDeviceId();

  int code = 0;
  String body;

  bool httpOk = NetClient::httpGetAuth(url, DeviceIdentity::getToken(), code, body);

  if (!httpOk || code != 200) {
    Serial.print("❌ Groceries HTTP failed, code=");
    Serial.println(code);

    g_cache.loaded = true;
    g_cache.ok = false;
    return false;
  }

  DynamicJsonDocument doc(8192);

  const size_t bodyLength = body.length();
  DeserializationError err = deserializeJson(doc, body);

  body = String();

  if (err) {
    Serial.print("❌ Groceries JSON parse failed, body length=");
    Serial.print(bodyLength);
    Serial.print(": ");
    Serial.println(err.c_str());

    g_cache.loaded = true;
    g_cache.ok = false;
    return false;
  }

  bool ok = doc["ok"] | false;
  if (!ok) {
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
    drawHeaderEmptyLine(c, contentTop, emptyPhrase());
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
  auto& d = DisplayCore::get();
  const uint16_t ink = Theme::ink();

  char headerText[64] = {0};
  bool usedDinnerTitle = false;

  if (g_cache.dinnerCount > 0) {
    char todayYmd[16] = {0};
    time_t now = time(nullptr);

    if (now > 0) {
      struct tm tmv;
      localtime_r(&now, &tmv);
      strftime(todayYmd, sizeof(todayYmd), "%Y-%m-%d", &tmv);

      for (int i = 0; i < g_cache.dinnerCount; i++) {
        if (!g_cache.dinners[i].used) continue;

        if (strcmp(g_cache.dinners[i].date, todayYmd) == 0) {
          safeCopy(headerText, sizeof(headerText), g_cache.dinners[i].title);
          usedDinnerTitle = true;
          break;
        }
      }
    }
  }

  if (!usedDinnerTitle) {
    safeCopy(headerText, sizeof(headerText), g_cache.header);
  }

  int contentTop = drawHeader(c, headerText, 20, FONT_B12);

  if (g_cache.count <= 0) {
    drawHeaderEmptyLine(c, contentTop, emptyPhrase());
    return;
  }

  const int visibleCount = min(g_cache.count, 3);

  if (g_cache.count > visibleCount) {
    char moreBuf[24] = {0};
    snprintf(moreBuf, sizeof(moreBuf), "+%d", g_cache.count - visibleCount);

    int16_t mx1, my1;
    uint16_t mw, mh;
    measureText(moreBuf, FONT_B9, mx1, my1, mw, mh);

    drawLeft(c.x + c.w - 12 - (int)mw - mx1, c.y + 12 - my1, moreBuf, FONT_B9, ink);
  }

  int contentBottom = c.y + c.h - 10;
  int contentH = contentBottom - contentTop;
  if (contentH <= 8) return;

  const int dividerInsetTop = 8;
  const int dividerInsetBottom = 8;
  const int dividerY = contentTop + dividerInsetTop;
  const int dividerH = max(8, contentH - dividerInsetTop - dividerInsetBottom);

  if (visibleCount == 2) {
    d.drawFastVLine(c.x + c.w / 2, dividerY, dividerH, ink);
  } else if (visibleCount == 3) {
    d.drawFastVLine(c.x + c.w / 3, dividerY, dividerH, ink);
    d.drawFastVLine(c.x + (c.w * 2) / 3, dividerY, dividerH, ink);
  }

  const int rotation = getRotationStep4h();
  const int textPadX = 8;

  for (int i = 0; i < visibleCount; i++) {
    int idx = wrapIndex(rotation + i, g_cache.count);

    int secX0 = c.x + (c.w * i) / visibleCount;
    int secX1 = c.x + (c.w * (i + 1)) / visibleCount;
    int secW = secX1 - secX0;

    char raw[72] = {0};
    formatItem(g_cache.items[idx], raw, sizeof(raw));

    char fit[72] = {0};
    fitTextToWidth(raw, fit, sizeof(fit), secW - textPadX * 2 - 4, FONT_B12);

    int16_t tx1, ty1;
    uint16_t tw, th;
    measureText(fit, FONT_B12, tx1, ty1, tw, th);

    int cx = secX0 + secW / 2;
    int baselineY = contentTop + (contentH - (int)th) / 2 - ty1;

    d.setFont(FONT_B12);
    d.setTextColor(ink);
    d.setTextSize(1);
    d.setCursor(cx - (int)tw / 2 - tx1, baselineY);
    d.print(fit);
    d.setFont(nullptr);
  }
}

static void drawGroceryColumns(const Cell& c, int contentTop, int maxVisibleItems) {
  auto& d = DisplayCore::get();
  const uint16_t ink = Theme::ink();

  if (g_cache.count <= 0) {
    drawHeaderEmptyLine(c, contentTop, emptyPhrase());
    return;
  }

  const int visibleCount = min(g_cache.count, maxVisibleItems);
  const bool hasMore = g_cache.count > visibleCount;

  const int lineH = fontLineHeight(FONT_B9);
  const int lineGap = 8;
  const int rowStep = lineH + lineGap;
  const int listTop = contentTop + 6;
  const int rotation = getRotationStep4h();

  const int dotR = 3;
  const int gap = 10;

  if (visibleCount <= 6) {
    char lines[6][72];
    int longestW = 0;

    for (int i = 0; i < visibleCount; i++) {
      lines[i][0] = '\0';

      int idx = wrapIndex(rotation + i, g_cache.count);

      char raw[72] = {0};
      formatItem(g_cache.items[idx], raw, sizeof(raw));

      fitTextToWidth(raw, lines[i], sizeof(lines[i]), c.w - 52, FONT_B9);

      int w = textWidth(lines[i], FONT_B9);
      if (w > longestW) longestW = w;
    }

    int totalW = dotR * 2 + gap + longestW;
    int textX = c.x + (c.w - totalW) / 2 + dotR * 2 + gap;

    for (int i = 0; i < visibleCount; i++) {
      if (!lines[i][0]) continue;

      int centerY = listTop + i * rowStep + lineH / 2;

      int16_t tx1, ty1;
      uint16_t tw, th;
      measureText(lines[i], FONT_B9, tx1, ty1, tw, th);

      int baseline = centerY - (int)th / 2 - ty1;

      d.fillCircle(textX - gap - dotR, centerY, dotR, ink);
      drawLeft(textX, baseline, lines[i], FONT_B9, ink);
    }

    return;
  }

  const int columnGap = 8;
  const int columnW = (c.w - columnGap) / 2;

  const int leftCount = (visibleCount + 1) / 2;
  const int rightCount = visibleCount / 2;
  const int rowCount = max(leftCount, rightCount);

  for (int col = 0; col < 2; col++) {
    int colCount = (col == 0) ? leftCount : rightCount;
    if (colCount <= 0) continue;

    int colX = c.x + col * (columnW + columnGap);
    int colCenterX = colX + columnW / 2;
    int maxTextW = max(12, columnW - dotR * 2 - gap - 10);

    char lines[6][72];
    int longestW = 0;

    for (int i = 0; i < colCount; i++) {
      lines[i][0] = '\0';

      int itemOffset = (col == 0) ? i : leftCount + i;
      int idx = wrapIndex(rotation + itemOffset, g_cache.count);

      char raw[72] = {0};
      formatItem(g_cache.items[idx], raw, sizeof(raw));

      fitTextToWidth(raw, lines[i], sizeof(lines[i]), maxTextW, FONT_B9);

      int w = textWidth(lines[i], FONT_B9);
      if (w > longestW) longestW = w;
    }

    int totalW = dotR * 2 + gap + longestW;
    int textX = colCenterX - totalW / 2 + dotR * 2 + gap;

    for (int i = 0; i < colCount; i++) {
      if (!lines[i][0]) continue;

      int centerY = listTop + i * rowStep + lineH / 2;

      int16_t tx1, ty1;
      uint16_t tw, th;
      measureText(lines[i], FONT_B9, tx1, ty1, tw, th);

      int baseline = centerY - (int)th / 2 - ty1;

      d.fillCircle(textX - gap - dotR, centerY, dotR, ink);
      drawLeft(textX, baseline, lines[i], FONT_B9, ink);
    }
  }

  if (hasMore) {
    char moreBuf[24] = {0};
    snprintf(moreBuf, sizeof(moreBuf), "+%d items", g_cache.count - visibleCount);

    int moreCenterY = listTop + rowCount * rowStep + lineH / 2;

    int16_t mx1, my1;
    uint16_t mw, mh;
    measureText(moreBuf, FONT_B9, mx1, my1, mw, mh);

    drawLeft(
      c.x + c.w / 2 - (int)mw / 2 - mx1,
      moreCenterY - (int)mh / 2 - my1,
      moreBuf,
      FONT_B9,
      ink
    );
  }
}

static void renderMedium(const Cell& c) {
  const uint16_t ink = Theme::ink();

  char headerText[64] = {0};
  char topLabel[32] = {0};
  bool usedDinnerTitle = false;

  if (g_cache.dinnerCount > 0) {
    char todayYmd[16] = {0};
    time_t now = time(nullptr);

    if (now > 0) {
      struct tm tmv;
      localtime_r(&now, &tmv);
      strftime(todayYmd, sizeof(todayYmd), "%Y-%m-%d", &tmv);

      for (int i = 0; i < g_cache.dinnerCount; i++) {
        if (!g_cache.dinners[i].used) continue;

        if (strcmp(g_cache.dinners[i].date, todayYmd) == 0) {
          safeCopy(headerText, sizeof(headerText), g_cache.dinners[i].title);
          safeCopy(topLabel, sizeof(topLabel), g_cache.languageNo ? "Middag i dag" : "Today's Dinner");
          usedDinnerTitle = true;
          break;
        }
      }
    }
  }

  if (!usedDinnerTitle) {
    safeCopy(headerText, sizeof(headerText), g_cache.header);
  }

  int headerTopPad = usedDinnerTitle ? 32 : 26;

  if (usedDinnerTitle && topLabel[0]) {
    char labelFit[32] = {0};
    fitTextToWidth(topLabel, labelFit, sizeof(labelFit), c.w - 24, FONT_B9);

    int16_t lx1, ly1;
    uint16_t lw, lh;
    measureText(labelFit, FONT_B9, lx1, ly1, lw, lh);

    int labelBaseline = c.y + 12 - ly1;
    drawLeft(c.x + c.w / 2 - (int)lw / 2 - lx1, labelBaseline, labelFit, FONT_B9, ink);
  }

  int contentTop = drawHeader(c, headerText, headerTopPad, FONT_B12);
  drawGroceryColumns(c, contentTop, 12);
}

static void drawDinnerPlanList(const Cell& right, int rightTop) {
  const uint16_t ink = Theme::ink();

  char todayYmd[16] = {0};
  bool hasTodayYmd = false;

  time_t now = time(nullptr);
  if (now > 0) {
    struct tm tmv;
    localtime_r(&now, &tmv);
    strftime(todayYmd, sizeof(todayYmd), "%Y-%m-%d", &tmv);
    hasTodayYmd = true;
  }

  int dinnerIndexes[7] = {0};
  int dinnerCount = 0;

  for (int i = 0; i < g_cache.dinnerCount && dinnerCount < 7; i++) {
    const DinnerPlanItem& dinner = g_cache.dinners[i];
    if (!dinner.used) continue;

    if (hasTodayYmd && strcmp(dinner.date, todayYmd) <= 0) {
      continue;
    }

    dinnerIndexes[dinnerCount++] = i;
  }

  if (dinnerCount <= 0) {
    drawHeaderEmptyLine(right, rightTop, g_cache.languageNo ? "Ingen middager planlagt" : "No dinners planned");
    return;
  }

  const int lineH = fontLineHeight(FONT_B9);
  const int lineGap = 8;
  const int rowStep = lineH + lineGap;
  const int listTop = rightTop + 6;
  const int maxRows = min(dinnerCount, 7);

  char labels[7][10] = {};
  char titles[7][48] = {};

  int labelW = 0;
  int longestTitleW = 0;

  for (int i = 0; i < maxRows; i++) {
    const DinnerPlanItem& dinner = g_cache.dinners[dinnerIndexes[i]];

    snprintf(labels[i], sizeof(labels[i]), "%s:", dinner.dayLabel);
    labelW = max(labelW, textWidth(labels[i], FONT_B9));
  }

  const int labelGap = 14;
  const int maxTitleW = max(20, right.w - 20 - labelW - labelGap);

  for (int i = 0; i < maxRows; i++) {
    const DinnerPlanItem& dinner = g_cache.dinners[dinnerIndexes[i]];
    fitTextToWidth(dinner.title, titles[i], sizeof(titles[i]), maxTitleW, FONT_B9);

    int titleW = textWidth(titles[i], FONT_B9);
    if (titleW > longestTitleW) longestTitleW = titleW;
  }

  const int totalContentW = labelW + labelGap + longestTitleW;
  const int startX = right.x + (right.w - totalContentW) / 2;

  for (int i = 0; i < maxRows; i++) {
    int centerY = listTop + i * rowStep + lineH / 2;

    int16_t lx1, ly1;
    uint16_t lw, lh;
    measureText(labels[i], FONT_B9, lx1, ly1, lw, lh);

    int labelBaseline = centerY - (int)lh / 2 - ly1;
    drawLeft(startX - lx1, labelBaseline, labels[i], FONT_B9, ink);

    int16_t tx1, ty1;
    uint16_t tw, th;
    measureText(titles[i], FONT_B9, tx1, ty1, tw, th);

    int titleBaseline = centerY - (int)th / 2 - ty1;
    drawLeft(startX + labelW + labelGap - tx1, titleBaseline, titles[i], FONT_B9, ink);
  }
}

static void renderLarge(const Cell& c) {
  const int gapX = 14;
  const int leftW = (c.w - gapX) / 2;
  const int rightW = c.w - gapX - leftW;

  Cell left = c;
  left.x = c.x;
  left.w = leftW;

  Cell right = c;
  right.x = c.x + leftW + gapX;
  right.w = rightW;

  int leftTop = drawHeader(left, g_cache.languageNo ? "Handleliste" : "Grocery List", 26, FONT_B12);
  drawGroceryColumns(left, leftTop, 12);

  char todayYmd[16] = {0};
  bool hasTodayYmd = false;

  time_t now = time(nullptr);
  if (now > 0) {
    struct tm tmv;
    localtime_r(&now, &tmv);
    strftime(todayYmd, sizeof(todayYmd), "%Y-%m-%d", &tmv);
    hasTodayYmd = true;
  }

  char rightHeader[64] = {0};
  safeCopy(rightHeader, sizeof(rightHeader), g_cache.languageNo ? "Ukemeny" : "Weekly Menu");

  for (int i = 0; i < g_cache.dinnerCount; i++) {
    const DinnerPlanItem& dinner = g_cache.dinners[i];
    if (!dinner.used) continue;

    if (hasTodayYmd && strcmp(dinner.date, todayYmd) == 0) {
      safeCopy(rightHeader, sizeof(rightHeader), dinner.title);
      break;
    }
  }

  int rightTop = drawHeader(right, rightHeader, 26, FONT_B12);
  drawDinnerPlanList(right, rightTop);
}

static void drawRunningLowList(const Cell& left, int leftTop) {
  auto& d = DisplayCore::get();
  const uint16_t ink = Theme::ink();

  if (g_cache.runningLowCount <= 0) {
    drawHeaderEmptyLine(left, leftTop, g_cache.languageNo ? "Alt ser bra ut" : "All stocked");
    return;
  }

  const int visibleCount = min(g_cache.runningLowCount, MAX_RUNNING_LOW_INSIGHTS);
  const int lineH = fontLineHeight(FONT_B9);
  const int lineGap = 8;
  const int rowStep = lineH + lineGap;
  const int listTop = leftTop + 6;
  const int dotR = 3;
  const int dotGap = 10;

  char lines[MAX_RUNNING_LOW_INSIGHTS][72];
  int longestW = 0;

  for (int i = 0; i < visibleCount; i++) {
    lines[i][0] = '\0';

    char raw[72] = {0};
    if (g_cache.runningLow[i].label[0]) {
      snprintf(raw, sizeof(raw), "%s - %s", g_cache.runningLow[i].name, g_cache.runningLow[i].label);
    } else {
      safeCopy(raw, sizeof(raw), g_cache.runningLow[i].name);
    }

    fitTextToWidth(raw, lines[i], sizeof(lines[i]), left.w - 52, FONT_B9);

    int w = textWidth(lines[i], FONT_B9);
    if (w > longestW) longestW = w;
  }

  int totalW = dotR * 2 + dotGap + longestW;
  int textX = left.x + (left.w - totalW) / 2 + dotR * 2 + dotGap;

  for (int i = 0; i < visibleCount; i++) {
    if (!lines[i][0]) continue;

    int centerY = listTop + i * rowStep + lineH / 2;

    int16_t tx1, ty1;
    uint16_t tw, th;
    measureText(lines[i], FONT_B9, tx1, ty1, tw, th);

    int baseline = centerY - (int)th / 2 - ty1;

    d.fillCircle(textX - dotGap - dotR, centerY, dotR, ink);
    drawLeft(textX, baseline, lines[i], FONT_B9, ink);
  }
}

static void drawMealIdeasList(const Cell& right, int rightTop) {
  auto& d = DisplayCore::get();
  const uint16_t ink = Theme::ink();

  if (g_cache.recipeCount <= 0) {
    const int lineH = fontLineHeight(FONT_B9);
    const int listTop = rightTop + 6;

    const char* line1 = g_cache.languageNo ? "L\xE6rer kj\xF8kkenet ditt" : "Learning your kitchen";
    const char* line2 = g_cache.languageNo ? "Legg til varer over tid" : "Add groceries over time";

    char fit1[72] = {0};
    char fit2[72] = {0};

    fitTextToWidth(line1, fit1, sizeof(fit1), right.w - 32, FONT_B9);
    fitTextToWidth(line2, fit2, sizeof(fit2), right.w - 32, FONT_B9);

    int w1 = textWidth(fit1, FONT_B9);
    int w2 = textWidth(fit2, FONT_B9);

    drawLeft(right.x + right.w / 2 - w1 / 2, listTop + lineH, fit1, FONT_B9, ink);
    drawLeft(right.x + right.w / 2 - w2 / 2, listTop + lineH * 2 + 8, fit2, FONT_B9, ink);
    return;
  }

  const int lineH = fontLineHeight(FONT_B9);
  const int rowGap = 16;
  const int startY = rightTop + 10;
  const int padX = 16;
  const int visibleCount = min(g_cache.recipeCount, MAX_RECIPE_INSIGHTS);

  int y = startY;

  for (int i = 0; i < visibleCount; i++) {
    const RecipeInsight& recipe = g_cache.recipes[i];
    if (!recipe.used) continue;

    char recipeFit[72] = {0};
    fitTextToWidth(recipe.name, recipeFit, sizeof(recipeFit), right.w - padX * 2 - 18, FONT_B9);

    d.fillCircle(right.x + padX, y - 5, 3, ink);
    drawLeft(right.x + padX + 14, y, recipeFit, FONT_B9, ink);

    y += lineH + 2;

    if (recipe.missingCount > 0) {
      char missingBuf[96] = {0};
      safeCopy(missingBuf, sizeof(missingBuf), g_cache.languageNo ? "mangler: " : "missing: ");

      for (int j = 0; j < recipe.missingCount; j++) {
        if (j > 0) strlcat(missingBuf, ", ", sizeof(missingBuf));
        strlcat(missingBuf, recipe.missing[j], sizeof(missingBuf));
      }

      char missingFit[96] = {0};
      fitTextToWidth(missingBuf, missingFit, sizeof(missingFit), right.w - padX * 2 - 14, FONT_B9);

      drawLeft(right.x + padX + 14, y, missingFit, FONT_B9, ink);
      y += lineH;
    }

    y += rowGap;
  }
}

static void renderXL(const Cell& c) {
  const int gapY = 16;

  int topH = (c.h - gapY) / 2;
  int bottomH = c.h - gapY - topH;

  Cell top = c;
  top.x = c.x;
  top.y = c.y;
  top.w = c.w;
  top.h = topH;

  Cell bottom = c;
  bottom.x = c.x;
  bottom.y = c.y + topH + gapY;
  bottom.w = c.w;
  bottom.h = bottomH;

  renderLarge(top);

  const int gapX = 18;
  const int leftW = (bottom.w - gapX) / 2;
  const int rightW = bottom.w - gapX - leftW;

  Cell left = bottom;
  left.x = bottom.x;
  left.y = bottom.y;
  left.w = leftW;
  left.h = bottom.h;

  Cell right = bottom;
  right.x = bottom.x + leftW + gapX;
  right.y = bottom.y;
  right.w = rightW;
  right.h = bottom.h;

  int leftTop = drawHeader(left, g_cache.languageNo ? "Snart tom" : "Running Low", 26, FONT_B12);
  drawRunningLowList(left, leftTop);

  int rightTop = drawHeader(right, g_cache.languageNo ? "Middagstips" : "Meal Ideas", 26, FONT_B12);
  drawMealIdeasList(right, rightTop);
}

// BEGIN ADAPTIVE GROCERIES RENDERER
static void adaptiveToday(char* out, size_t size) {
  if (!out || size == 0) return;
  out[0] = '\0';
  time_t now = time(nullptr);
  if (now <= 0) return;
  struct tm tmv;
  localtime_r(&now, &tmv);
  strftime(out, size, "%Y-%m-%d", &tmv);
}

static int adaptiveTodayDinner(const char* today) {
  if (!today || !today[0]) return -1;
  for (int i = 0; i < g_cache.dinnerCount; ++i)
    if (g_cache.dinners[i].used && strcmp(g_cache.dinners[i].date, today) == 0) return i;
  return -1;
}

static int adaptiveFutureCount(const char* today) {
  int count = 0;
  for (int i = 0; i < g_cache.dinnerCount; ++i)
    if (g_cache.dinners[i].used && (!today[0] || strcmp(g_cache.dinners[i].date, today) > 0)) ++count;
  return count;
}

// Finds the nth future dinner without copying/sorting the dinner cache.
static int adaptiveFutureDinner(const char* today, int ordinal) {
  int after = -1;
  for (int n = 0; n <= ordinal; ++n) {
    int best = -1;
    for (int i = 0; i < g_cache.dinnerCount; ++i) {
      if (!g_cache.dinners[i].used || (today[0] && strcmp(g_cache.dinners[i].date, today) <= 0)) continue;
      if (after >= 0 && strcmp(g_cache.dinners[i].date, g_cache.dinners[after].date) <= 0) continue;
      if (best < 0 || strcmp(g_cache.dinners[i].date, g_cache.dinners[best].date) < 0) best = i;
    }
    after = best;
    if (after < 0) break;
  }
  return after;
}

static void adaptiveLine(int x, int y, int width, const char* value, const GFXfont* font) {
  if (width < 4) return;
  char fit[80] = {0};
  fitTextToWidth(value, fit, sizeof(fit), width, font);
  drawLeft(x, y, fit, font, Theme::ink());
}

static void adaptiveCenteredLine(int x, int y, int width, const char* value, const GFXfont* font) {
  if (width < 4) return;
  char fit[80] = {0};
  fitTextToWidth(value, fit, sizeof(fit), width, font);
  int16_t x1, y1;
  uint16_t tw, th;
  measureText(fit, font, x1, y1, tw, th);
  if (static_cast<int>(tw) > width) return;
  drawLeft(x + (width - static_cast<int>(tw)) / 2 - x1, y, fit, font, Theme::ink());
}

static void adaptiveHeading(int x, int top, int width, int height, const char* value) {
  if (width < 4 || height < 4) return;
  char fit[80] = {0};
  fitTextToWidth(value, fit, sizeof(fit), width, FONT_B12);
  int16_t x1, y1;
  uint16_t tw, th;
  measureText(fit, FONT_B12, x1, y1, tw, th);
  if (static_cast<int>(tw) > width) return;
  const int textX = x + (width - static_cast<int>(tw)) / 2 - x1;
  drawLeft(textX, top + min(height - 4, 18) - y1, fit, FONT_B12, Theme::ink());
}

static void renderAdaptiveGroceries(const Cell& c) {
  char today[16] = {0};
  adaptiveToday(today, sizeof(today));
  const int todayDinner = adaptiveTodayDinner(today);
  const int futureCount = adaptiveFutureCount(today);
  GroceriesAdaptivePolicy::Input input = {
    c.w, c.h, !g_cache.ok, static_cast<uint8_t>(min(g_cache.count, 255)),
    static_cast<uint8_t>(min(g_cache.dinnerCount, 255)),
    static_cast<uint8_t>(min(futureCount, 255)), todayDinner >= 0,
    static_cast<uint8_t>(min(g_cache.runningLowCount, 255)),
    static_cast<uint8_t>(min(g_cache.recipeCount, 255))
  };
  const GroceriesAdaptivePolicy::Result layout = GroceriesAdaptivePolicy::compose(input);
  if (layout.family == GroceriesAdaptivePolicy::EMPTY) {
    const int pad = max(9, min(14, c.w * 35 / 1000));
    adaptiveHeading(c.x + pad, c.y + pad, max(1, c.w - pad * 2), 28,
                    g_cache.languageNo ? "Handleliste" : "Grocery List");
    adaptiveCenteredLine(c.x + pad, c.y + c.h / 2 + 8, max(1, c.w - pad * 2),
                         layout.failed ? "Fetch failed" : emptyPhrase(), FONT_B9);
    return;
  }

  auto& d = DisplayCore::get();
  const uint16_t ink = Theme::ink();
  const int pad = max(9, min(14, c.w * 35 / 1000));
  const int gap = 12;
  const int innerX = c.x + pad;
  const int innerW = max(1, c.w - pad * 2);
  const bool alignedThreeByFour = c.colSpan == 3 && c.rowSpan == 4 &&
    layout.showRunningLow && !layout.showMealIdeas;
  int topH = max(1, c.h - pad * 2);
  int bottomH = 0;
  if ((layout.showRunningLow || layout.showMealIdeas) && !alignedThreeByFour) {
    bottomH = min(116, c.h * 31 / 100);
    topH = max(1, topH - bottomH - gap);
  }
  int groceryW = innerW;
  int menuX = 0, menuW = 0;
  if (layout.showMenu) {
    const int split = max(c.w * 54 / 100, 250);
    groceryW = max(1, split - pad);
    menuX = c.x + split + gap;
    menuW = max(1, c.x + c.w - pad - menuX);
    d.drawFastVLine(menuX - gap / 2, c.y + pad, topH, ink);
  } else if (alignedThreeByFour) {
    groceryW = (innerW - gap) * 68 / 100;
  }

  const bool todayHeading = layout.todayIsHeading && todayDinner >= 0;
  const int headerH = todayHeading && layout.family != GroceriesAdaptivePolicy::ITEM_STRIP &&
    layout.family != GroceriesAdaptivePolicy::MICRO ? 48 : 32;
  if (todayHeading && headerH > 32)
    adaptiveLine(innerX, c.y + pad + 12, groceryW, g_cache.languageNo ? "Middag i dag" : "Today's Dinner", FONT_B9);
  const char* heading = todayHeading ? g_cache.dinners[todayDinner].title : g_cache.header;
  adaptiveHeading(innerX, c.y + pad + (headerH > 32 ? 16 : 0), groceryW,
                  headerH - (headerH > 32 ? 16 : 0), heading);

  const int listY = c.y + pad + headerH + 8;
  const int listH = max(0, topH - headerH - 8);
  const int overflowH = 18;
  const int rowStep = 26;
  int columns = layout.horizontal ? min(3, max(1, g_cache.count)) : layout.columns;
  int capacity = 0;
  const int unreservedCapacity = layout.horizontal ? min(3, g_cache.count) : max(0, listH / rowStep) * columns;
  if (g_cache.count <= unreservedCapacity) capacity = unreservedCapacity;
  else if (layout.horizontal) capacity = min(3, g_cache.count);
  else capacity = max(0, (listH - overflowH) / rowStep) * columns;
  capacity = min(12, min(capacity, g_cache.count));
  const int rotation = getRotationStep4h();
  const int perColumn = max(1, (capacity + columns - 1) / columns);
  for (int i = 0; i < capacity; ++i) {
    const GroceryItem& item = g_cache.items[wrapIndex(rotation + i, g_cache.count)];
    int x, y, width;
    if (layout.horizontal) {
      x = innerX + groceryW * i / capacity + 4;
      width = groceryW * (i + 1) / capacity - groceryW * i / capacity - 8;
      y = listY + min(18, listH / 2);
      if (i) d.drawFastVLine(innerX + groceryW * i / capacity, listY, max(1, listH - (g_cache.count > capacity ? overflowH : 0)), ink);
    } else {
      const int col = i / perColumn, row = i % perColumn;
      const int columnW = groceryW / columns;
      x = innerX + col * columnW + 14;
      width = max(1, columnW - 20);
      y = listY + row * rowStep + 15;
      d.fillCircle(x - 8, y - 5, 3, ink);
    }
    if (layout.horizontal) {
      char raw[72] = {0};
      formatItem(item, raw, sizeof(raw));
      adaptiveCenteredLine(x, y, width, raw, FONT_B12);
    } else if (item.qty > 1) {
      char quantity[16] = {0};
      snprintf(quantity, sizeof(quantity), "%dx", item.qty);
      const int quantityW = textWidth(quantity, FONT_B9);
      if (quantityW <= width) {
        adaptiveLine(x, y, quantityW, quantity, FONT_B9);
        adaptiveLine(x + quantityW + 6, y, max(1, width - quantityW - 6), item.name, FONT_B9);
      }
    } else adaptiveLine(x, y, width, item.name, FONT_B9);
  }
  if (g_cache.count > capacity && listH >= overflowH) {
    char more[24] = {0};
    snprintf(more, sizeof(more), "+%d more", g_cache.count - capacity);
    if (groceryW < 70) snprintf(more, sizeof(more), "+%d", g_cache.count - capacity);
    adaptiveCenteredLine(innerX, c.y + pad + topH - 3, groceryW, more, FONT_B9);
  }

  if (layout.showMenu) {
    const char* menuHeading = todayDinner >= 0 ? g_cache.dinners[todayDinner].title :
      (g_cache.languageNo ? "Ukemeny" : "Weekly Menu");
    adaptiveHeading(menuX, c.y + pad, menuW, 32, menuHeading);
    const int maxRows = min(futureCount, max(0, (topH - 38) / 24));
    for (int i = 0; i < maxRows; ++i) {
      const int index = adaptiveFutureDinner(today, i);
      if (index < 0) break;
      char line[72] = {0};
      snprintf(line, sizeof(line), "%s: %s", g_cache.dinners[index].dayLabel, g_cache.dinners[index].title);
      adaptiveLine(menuX, c.y + pad + 54 + i * 24, menuW, line, FONT_B9);
    }
  }

  if (bottomH > 0 || alignedThreeByFour) {
    const int bottomY = alignedThreeByFour ? c.y + pad : c.y + pad + topH + gap;
    const bool both = layout.showRunningLow && layout.showMealIdeas;
    const int half = both ? (c.w - gap) / 2 : c.w;
    if (layout.showRunningLow) {
      const int secondaryX = alignedThreeByFour ? innerX + groceryW + gap : innerX;
      const int width = alignedThreeByFour ? max(1, innerX + innerW - secondaryX) : max(1, half - pad);
      adaptiveHeading(secondaryX, bottomY, width, 25, g_cache.languageNo ? "SNART TOM" : "RUNNING LOW");
      for (int i = 0; i < min(3, g_cache.runningLowCount); ++i) {
        char full[84] = {0};
        snprintf(full, sizeof(full), g_cache.runningLow[i].label[0] ? "%s - %s" : "%s",
                 g_cache.runningLow[i].name, g_cache.runningLow[i].label);
        const GroceriesAdaptivePolicy::RunningLowMode mode = GroceriesAdaptivePolicy::runningLowMode(
          textWidth(full, FONT_B9) <= width, textWidth(g_cache.runningLow[i].name, FONT_B9) <= width);
        adaptiveLine(secondaryX, bottomY + 46 + i * 24, width,
                     mode == GroceriesAdaptivePolicy::RUNNING_FULL ? full : g_cache.runningLow[i].name, FONT_B9);
      }
    }
    if (layout.showMealIdeas) {
      const int x = both ? c.x + half + gap : innerX;
      const int width = both ? max(1, c.x + c.w - pad - x) : innerW;
      adaptiveHeading(x, bottomY, width, 25, g_cache.languageNo ? "MIDDAGSTIPS" : "MEAL IDEAS");
      for (int i = 0; i < min(2, g_cache.recipeCount); ++i) {
        char two[112] = {0}, one[112] = {0}, line[112] = {0};
        safeCopy(one, sizeof(one), g_cache.recipes[i].name);
        strlcat(one, g_cache.languageNo ? " - mangler: " : " - missing: ", sizeof(one));
        if (g_cache.recipes[i].missingCount > 0) strlcat(one, g_cache.recipes[i].missing[0], sizeof(one));
        safeCopy(two, sizeof(two), one);
        if (g_cache.recipes[i].missingCount > 1) { strlcat(two, ", ", sizeof(two)); strlcat(two, g_cache.recipes[i].missing[1], sizeof(two)); }
        const uint8_t missing = GroceriesAdaptivePolicy::mealMissingCount(
          g_cache.recipes[i].missingCount > 1 && textWidth(two, FONT_B9) <= width,
          g_cache.recipes[i].missingCount > 0 && textWidth(one, FONT_B9) <= width);
        safeCopy(line, sizeof(line), missing == 2 ? two : (missing == 1 ? one : g_cache.recipes[i].name));
        adaptiveLine(x, bottomY + 46 + i * 38, width, line, FONT_B9);
      }
    }
  }
}
// END ADAPTIVE GROCERIES RENDERER

void setConfig(const FrameConfig* cfg) {
  g_cfg = cfg;
  (void)g_cfg;
  g_cache.loaded = false;
}

void render(const Cell& c, const String& moduleName) {
  (void)moduleName;

  ensureLoaded();

  if (c.size == CELL_ADAPTIVE) {
    renderAdaptiveGroceries(c);
    return;
  }

  if (!g_cache.ok) {
    drawEmptyState(c, "Grocery List", "Fetch failed");
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
