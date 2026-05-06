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
#include <stdio.h>
#include <math.h>

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

struct DinnerPlanItem {
  bool used = false;
  char date[11] = {0};
  char dayLabel[8] = {0};
  char title[80] = {0};
};

static const int MAX_DINNER_ITEMS = 14;

struct GroceryCache {
  bool loaded = false;
  bool ok = false;
  int count = 0;
  GroceryItem items[MAX_ITEMS];
  int dinnerCount = 0;
  DinnerPlanItem dinners[MAX_DINNER_ITEMS];
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
        default:   out[oi++] = '?'; break;
      }
      continue;
    }

    out[oi++] = '?';
  }

  out[oi] = 0;
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

static int fontLineHeight(const GFXfont* font) {
  if (font == FONT_B18) return 24;
  if (font == FONT_B12) return 18;
  return 14;
}

static const int ORIGINAL_CENTERED_LIST_LINE_GAP = 12;
static const int COMPACT_CENTERED_LIST_LINE_GAP = 8;

static int leftListLineHeight(const GFXfont* font) {
  return fontLineHeight(font) + ((font == FONT_B9) ? 5 : 12);
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

static int wrapIndex(int idx, int count) {
  if (count <= 0) return 0;
  while (idx < 0) idx += count;
  while (idx >= count) idx -= count;
  return idx;
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
  safeCopy(out, outSize, "Menu");

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

static bool extractTodayDinnerTitle(JsonVariant src, const char* todayYmd, char* out, size_t outSize) {
  if (!todayYmd || !todayYmd[0] || src.isNull()) return false;

  if (src.is<JsonArray>()) {
    for (JsonVariant v : src.as<JsonArray>()) {
      if (!v.is<JsonObject>()) continue;

      JsonObject o = v.as<JsonObject>();
      const char* date = o["date"] | o["day"] | o["planned_date"] | "";
      if (!date || strcmp(date, todayYmd) != 0) continue;

      const char* title = o["title"] | o["name"] | o["dish"] | o["meal"] | "";
      if (title && title[0]) {
        utf8ToLatin1(out, outSize, title);
        return true;
      }
    }
  }

  if (src.is<JsonObject>()) {
    JsonObject obj = src.as<JsonObject>();
    JsonVariant todayNode = obj[todayYmd];

    if (todayNode.is<JsonObject>()) {
      const char* title = todayNode["title"] | todayNode["name"] | todayNode["dish"] | todayNode["meal"] | "";
      if (title && title[0]) {
        utf8ToLatin1(out, outSize, title);
        return true;
      }
    } else if (todayNode.is<const char*>()) {
      const char* title = todayNode.as<const char*>();
      if (title && title[0]) {
        utf8ToLatin1(out, outSize, title);
        return true;
      }
    }
  }

  return false;
}

static const char* emptyPhrase() {
  static const char* phrases[] = {
    "Fridge is stacked",
    "Pantry looks good",
    "Kitchen is covered",
    "No grocery run needed"
  };

  int r = getRotationStep4h();
  return phrases[r % 4];
}

static void formatItem(const GroceryItem& item, char* out, size_t outSize) {
  if (!out || outSize == 0) return;
  out[0] = '\0';

  if (item.qty > 1) {
    snprintf(out, outSize, "%dx %s", item.qty, item.name);
  } else {
    safeCopy(out, outSize, item.name);
  }
}

static int drawHeader(const Cell& c, const char* header, int topPad, const GFXfont* font) {
  auto& d = DisplayCore::get();
  const uint16_t ink = Theme::ink();

  char fit[96] = {0};
  fitTextToWidth(header, fit, sizeof(fit), c.w - 24, font);

  int16_t hx1, hy1;
  uint16_t hw, hh;
  measureText(fit, font, hx1, hy1, hw, hh);

  int titleBaseline = c.y + topPad - hy1;

  d.setFont(font);
  d.setTextColor(ink);
  d.setTextSize(1);
  d.setCursor(c.x + c.w / 2 - (int)hw / 2 - hx1, titleBaseline);
  d.print(fit);
  d.setFont(nullptr);

  const int underlineGap = 1;
  const int underlineH = 2;
  int underlineY = titleBaseline + hy1 + (int)hh + underlineGap;
  int underlineX = c.x + c.w / 2 - (int)hw / 2;

  d.fillRect(underlineX, underlineY, (int)hw, underlineH, ink);

  return underlineY + underlineH + 10;
}

static void drawTopRightSmallNote(const Cell& c, const char* txt, int y) {
  int16_t x1, y1;
  uint16_t tw, th;
  measureText(txt, FONT_B9, x1, y1, tw, th);

  int drawX = c.x + c.w - 12 - (int)tw;
  drawLeft(drawX - x1, y - y1, txt, FONT_B9, Theme::ink());
}

static void drawEmptyState(const Cell& c, const char* line1, const char* line2) {
  const GFXfont* f1 = FONT_B12;
  const GFXfont* f2 = FONT_B9;

  int lh1 = fontLineHeight(f1);
  int lh2 = fontLineHeight(f2);
  int totalH = lh1 + 6 + lh2;

  int cy = c.y + (c.h / 2) - (totalH / 2);
  int centerX = c.x + c.w / 2;

  int w1 = textWidth(line1, f1);
  int w2 = textWidth(line2, f2);

  drawLeft(centerX - w1 / 2, cy + lh1, line1, f1, Theme::ink());
  drawLeft(centerX - w2 / 2, cy + lh1 + 6 + lh2, line2, f2, Theme::ink());
}

static void drawCenteredBulletLine(const Cell& c,
                                   int centerY,
                                   const char* text,
                                   const GFXfont* font,
                                   int anchorTextStartX) {
  auto& d = DisplayCore::get();

  int16_t tx1, ty1;
  uint16_t tw, th;
  measureText(text, font, tx1, ty1, tw, th);

  const int dotR = 3;
  const int gap = 10;

  int textBaseline = centerY - (int)th / 2 - ty1;
  int dotCx = anchorTextStartX - gap - dotR;
  int dotCy = centerY;

  d.fillCircle(dotCx, dotCy, dotR, Theme::ink());

  d.setFont(font);
  d.setTextColor(Theme::ink());
  d.setTextSize(1);
  d.setCursor(anchorTextStartX, textBaseline);
  d.print(text);
  d.setFont(nullptr);
}

static void drawCenteredMoreLine(const Cell& c,
                                 int centerY,
                                 const char* text,
                                 const GFXfont* font) {
  if (!text || !text[0]) return;

  int16_t tx1, ty1;
  uint16_t tw, th;
  measureText(text, font, tx1, ty1, tw, th);

  int drawX = c.x + c.w / 2 - (int)tw / 2 - tx1;

  drawLeft(drawX,
           centerY - (int)th / 2 - ty1,
           text,
           font,
           Theme::ink());
}

static int drawCenteredItemList(const Cell& c,
                                 int startOffset,
                                 int visibleCount,
                                 int yTop,
                                 int totalH,
                                 const GFXfont* lineFont,
                                 int lineGap) {
  if (g_cache.count <= 0 || visibleCount <= 0) return c.x + c.w / 2;

  const int lineH = fontLineHeight(lineFont);
  const int dotR = 3;
  const int gap = 10;

  int blockH = visibleCount * lineH + (visibleCount - 1) * lineGap;
  int startY = yTop + (totalH - blockH) / 2;

  char lines[8][128];
  int widths[8] = {0};
  int longestW = 0;

  if (visibleCount > 8) visibleCount = 8;

  int rotation = getRotationStep4h();

  for (int i = 0; i < visibleCount; i++) {
    lines[i][0] = '\0';

    int idx = wrapIndex(rotation + startOffset + i, g_cache.count);

    char raw[128] = {0};
    formatItem(g_cache.items[idx], raw, sizeof(raw));

    fitTextToWidth(raw, lines[i], sizeof(lines[i]), c.w - 50, lineFont);
    widths[i] = textWidth(lines[i], lineFont);
    if (widths[i] > longestW) longestW = widths[i];
  }

  int totalLongestW = dotR * 2 + gap + longestW;
  int anchorTextStartX = c.x + (c.w - totalLongestW) / 2 + dotR * 2 + gap;

  for (int i = 0; i < visibleCount; i++) {
    if (!lines[i][0]) continue;
    int centerY = startY + i * (lineH + lineGap) + lineH / 2;
    drawCenteredBulletLine(c, centerY, lines[i], lineFont, anchorTextStartX);
  }

  return anchorTextStartX;
}

static void drawCenteredItemColumns(const Cell& c,
                                    int visibleCount,
                                    int yTop,
                                    int totalH,
                                    const GFXfont* lineFont,
                                    int lineGap,
                                    const char* moreText) {
  if (g_cache.count <= 0 || visibleCount <= 0) return;

  if (visibleCount <= 6) {
    drawCenteredItemList(c, 0, visibleCount, yTop, totalH, lineFont, lineGap);
    return;
  }

  const int lineH = fontLineHeight(lineFont);
  const int rowsPerColumn = 6;
  const int leftCount = min(rowsPerColumn, visibleCount);
  const int rightCount = min(rowsPerColumn, max(0, visibleCount - leftCount));
  const int rowCount = max(leftCount, rightCount);
  const int moreRows = (moreText && moreText[0]) ? 1 : 0;
  const int rowStep = lineH + lineGap;
  const int blockH = rowCount * lineH + max(0, rowCount - 1) * lineGap + moreRows * rowStep;
  const int startY = yTop + max(0, (totalH - blockH) / 2);
  const int dotR = 3;
  const int gap = 10;
  const int columnGap = 8;
  const int columnW = (c.w - columnGap) / 2;
  const int rotation = getRotationStep4h();

  for (int col = 0; col < 2; col++) {
    const int colCount = (col == 0) ? leftCount : rightCount;
    if (colCount <= 0) continue;

    const int colX = c.x + col * (columnW + columnGap);
    const int colCenterX = colX + columnW / 2;
    const int maxTextW = max(12, columnW - dotR * 2 - gap - 10);
    char lines[6][128];
    int longestW = 0;

    for (int i = 0; i < colCount; i++) {
      lines[i][0] = '\0';

      int idx = wrapIndex(rotation + col * rowsPerColumn + i, g_cache.count);

      char raw[128] = {0};
      formatItem(g_cache.items[idx], raw, sizeof(raw));

      fitTextToWidth(raw, lines[i], sizeof(lines[i]), maxTextW, lineFont);
      int w = textWidth(lines[i], lineFont);
      if (w > longestW) longestW = w;
    }

    int totalLongestW = dotR * 2 + gap + longestW;
    int anchorTextStartX = colCenterX - totalLongestW / 2 + dotR * 2 + gap;

    for (int i = 0; i < colCount; i++) {
      if (!lines[i][0]) continue;
      int centerY = startY + i * rowStep + lineH / 2;
      drawCenteredBulletLine(c, centerY, lines[i], lineFont, anchorTextStartX);
    }
  }

  if (moreRows > 0) {
    int moreCenterY = startY + rowCount * rowStep + lineH / 2;
    drawCenteredMoreLine(c, moreCenterY, moreText, lineFont);
  }
}

static void drawLeftItemList(const Cell& c,
                             int startOffset,
                             int visibleCount,
                             int yTop,
                             int yBottom,
                             const GFXfont* font) {
  if (g_cache.count <= 0 || visibleCount <= 0) return;

  auto& d = DisplayCore::get();
  const uint16_t ink = Theme::ink();

  const int padX = 18;
  const int lineH = leftListLineHeight(font);
  const int dotR = 3;
  const int gap = 12;

  int availableH = yBottom - yTop;
  int blockH = visibleCount * lineH;
  int startY = yTop + max(0, (availableH - blockH) / 2);

  int rotation = getRotationStep4h();

  for (int i = 0; i < visibleCount; i++) {
    int idx = wrapIndex(rotation + startOffset + i, g_cache.count);

    char raw[128] = {0};
    formatItem(g_cache.items[idx], raw, sizeof(raw));

    char fit[128] = {0};
    fitTextToWidth(raw, fit, sizeof(fit), c.w - padX * 2 - gap - dotR * 2, font);

    int rowY = startY + i * lineH;
    int centerY = rowY + lineH / 2;

    d.fillCircle(c.x + padX + dotR, centerY, dotR, ink);
    int16_t tx1, ty1;
    uint16_t tw, th;
    measureText(fit, font, tx1, ty1, tw, th);
    int textBaseline = centerY - (int)th / 2 - ty1;
    drawLeft(c.x + padX + dotR * 2 + gap, textBaseline, fit, font, ink);
  }
}

static bool fetchGroceries() {
  clearCache();

  String url = String(BASE_URL) + "/api/device/frame-config?device_id=" + DeviceIdentity::getDeviceId();

  int code = 0;
  String body;

  if (!NetClient::httpGetAuth(url, DeviceIdentity::getToken(), code, body) || code != 200) {
    g_cache.loaded = true;
    g_cache.ok = false;
    return false;
  }

  StaticJsonDocument<16384> doc;
  if (deserializeJson(doc, body)) {
    g_cache.loaded = true;
    g_cache.ok = false;
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
      utf8ToLatin1(g_cache.items[idx].name, sizeof(g_cache.items[idx].name), nm);
      g_cache.items[idx].qty = max(1, (int)(it["quantity"] | 1));
      idx++;
    }
  }

  g_cache.count = idx;

  JsonArray dinnerArr = doc["settings_json"]["modules"]["dinner_planner"].as<JsonArray>();
  if (dinnerArr.isNull()) dinnerArr = doc["settings_json"]["modules"]["dinnerPlanner"].as<JsonArray>();
  if (dinnerArr.isNull()) dinnerArr = doc["settings_json"]["dinner_planner"].as<JsonArray>();
  if (dinnerArr.isNull()) dinnerArr = doc["settings_json"]["dinnerPlanner"].as<JsonArray>();

  int dinnerIdx = 0;
  if (!dinnerArr.isNull()) {
    for (JsonObject it : dinnerArr) {
      if (dinnerIdx >= MAX_DINNER_ITEMS) break;

      const char* date = it["date"] | it["day"] | it["planned_date"] | "";
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
    fitTextToWidth(dinnerTitle, titleFit, sizeof(titleFit), 210, FONT_B12);
    snprintf(g_cache.header, sizeof(g_cache.header), "Today's Dinner: %s", titleFit);
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

static void renderSmall(const Cell& c) {
  if (g_cache.count <= 0) {
    int contentTop = drawHeader(c, g_cache.header, 20, FONT_B12);
    Cell body = c;
    body.y = contentTop;
    body.h = c.y + c.h - contentTop;
    drawEmptyState(body, "All set", emptyPhrase());
    return;
  }

  int contentTop = drawHeader(c, g_cache.header, 20, FONT_B12);

  const int visibleCount = min(g_cache.count, 3);

  if (g_cache.count > visibleCount) {
    char moreBuf[24];
    snprintf(moreBuf, sizeof(moreBuf), "+%d items", g_cache.count - visibleCount);
    drawTopRightSmallNote(c, moreBuf, c.y + 12);
  }

  int contentBottom = c.y + c.h - 10;
  int contentH = contentBottom - contentTop;
  if (contentH <= 8) return;

  const int dividerInsetTop = 8;
  const int dividerInsetBottom = 8;
  const int dividerY = contentTop + dividerInsetTop;
  const int dividerH = max(8, contentH - dividerInsetTop - dividerInsetBottom);

  auto& d = DisplayCore::get();
  const uint16_t ink = Theme::ink();

  if (visibleCount == 2) {
    int divX = c.x + c.w / 2;
    d.drawFastVLine(divX, dividerY, dividerH, ink);
  } else if (visibleCount == 3) {
    int div1X = c.x + c.w / 3;
    int div2X = c.x + (c.w * 2) / 3;
    d.drawFastVLine(div1X, dividerY, dividerH, ink);
    d.drawFastVLine(div2X, dividerY, dividerH, ink);
  }

  const int rotation = getRotationStep4h();
  const int textPadX = 8;

  for (int i = 0; i < visibleCount; i++) {
    int idx = wrapIndex(rotation + i, g_cache.count);

    int secX0 = c.x + (c.w * i) / visibleCount;
    int secX1 = c.x + (c.w * (i + 1)) / visibleCount;
    int secW = secX1 - secX0;

    char raw[128] = {0};
    formatItem(g_cache.items[idx], raw, sizeof(raw));

    char fit[128] = {0};
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

static void renderMedium(const Cell& c, bool useTwoColumns = true) {
  auto& d = DisplayCore::get();
  const uint16_t ink = Theme::ink();

  char mainHeader[96] = {0};
  char topLabel[32] = {0};
  bool hasDinner = false;

  const char* dinnerPrefix = "Today's Dinner:";

  if (strncmp(g_cache.header, dinnerPrefix, strlen(dinnerPrefix)) == 0) {
    hasDinner = true;

    safeCopy(topLabel, sizeof(topLabel), "Today's Dinner");

    const char* dinner = g_cache.header + strlen(dinnerPrefix);
    while (*dinner == ' ') dinner++;

    safeCopy(mainHeader, sizeof(mainHeader), dinner);
  } else {
    safeCopy(mainHeader, sizeof(mainHeader), g_cache.header);
  }

  int headerTopPad = hasDinner ? 32 : 26;

  if (hasDinner && topLabel[0]) {
    char labelFit[32] = {0};
    fitTextToWidth(topLabel, labelFit, sizeof(labelFit), c.w - 24, FONT_B9);

    int16_t lx1, ly1;
    uint16_t lw, lh;
    measureText(labelFit, FONT_B9, lx1, ly1, lw, lh);

    int labelBaseline = c.y + 12 - ly1;

    d.setFont(FONT_B9);
    d.setTextColor(ink);
    d.setTextSize(1);
    d.setCursor(c.x + c.w / 2 - (int)lw / 2 - lx1, labelBaseline);
    d.print(labelFit);
    d.setFont(nullptr);
  }

  int contentTop = drawHeader(c, mainHeader, headerTopPad, FONT_B12);

  if (g_cache.count <= 0) {
    Cell body = c;
    body.y = contentTop;
    body.h = c.y + c.h - contentTop;

    drawEmptyState(body, "All set", emptyPhrase());
    return;
  }

  int contentBottom = c.y + c.h - 14;
  int contentH = contentBottom - contentTop;
  if (contentH <= 8) return;

  if (!useTwoColumns) {
    const int maxRows = 7;
    const bool hasMore = g_cache.count > maxRows;
    const int visibleCount = min(g_cache.count, hasMore ? maxRows - 1 : maxRows);

    char moreBuf[24] = {0};
    const int renderedRows = visibleCount + (hasMore ? 1 : 0);

    if (hasMore) {
      snprintf(moreBuf, sizeof(moreBuf), "+%d items", g_cache.count - visibleCount);
    }

    int lineH = fontLineHeight(FONT_B9);
    int blockH = renderedRows * lineH + max(0, renderedRows - 1) * COMPACT_CENTERED_LIST_LINE_GAP;
    int listStartY = contentTop + max(0, (contentH - blockH) / 2);

    drawCenteredItemList(
      c,
      0,
      visibleCount,
      listStartY,
      visibleCount * lineH + max(0, visibleCount - 1) * COMPACT_CENTERED_LIST_LINE_GAP,
      FONT_B9,
      COMPACT_CENTERED_LIST_LINE_GAP
    );

    if (hasMore) {
      int moreCenterY = listStartY + visibleCount * (lineH + COMPACT_CENTERED_LIST_LINE_GAP) + lineH / 2;
      drawCenteredMoreLine(c, moreCenterY, moreBuf, FONT_B9);
    }
    return;
  }

  const int maxVisibleItems = 12;
  const int visibleCount = min(g_cache.count, maxVisibleItems);
  const bool hasMore = g_cache.count > visibleCount;

  char moreBuf[24] = {0};
  if (hasMore) {
    snprintf(moreBuf, sizeof(moreBuf), "+%d items", g_cache.count - visibleCount);
  }

  drawCenteredItemColumns(
    c,
    visibleCount,
    contentTop,
    contentH,
    FONT_B9,
    COMPACT_CENTERED_LIST_LINE_GAP,
    moreBuf
  );
}

static void drawWeeklyMenu(const Cell& c) {
  int contentTop = drawHeader(c, "Weekly Menu", 28, FONT_B12);

  if (g_cache.dinnerCount <= 0) {
    Cell body = c;
    body.y = contentTop;
    body.h = c.y + c.h - contentTop;
    drawEmptyState(body, "No menu", "Plan dinners first");
    return;
  }

  const uint16_t ink = Theme::ink();
  const int padX = 12;
  const int labelGap = 16;
  const int lineH = leftListLineHeight(FONT_B9);
  const int availableH = c.y + c.h - 18 - contentTop;
  const int visibleCount = min(g_cache.dinnerCount, min(7, max(1, availableH / lineH)));
  const int startY = contentTop + max(0, (availableH - visibleCount * lineH) / 2);
  const int availableW = max(0, c.w - padX * 2);

  char labels[7][10] = {};
  char titles[7][96] = {};
  int labelW = 0;

  for (int i = 0; i < visibleCount; i++) {
    const DinnerPlanItem& dinner = g_cache.dinners[i];
    if (!dinner.used) continue;

    snprintf(labels[i], sizeof(labels[i]), "%s:", dinner.dayLabel);
    labelW = max(labelW, textWidth(labels[i], FONT_B9));
  }

  const int maxTitleW = max(0, availableW - labelW - labelGap);
  int longestRowW = 0;

  for (int i = 0; i < visibleCount; i++) {
    const DinnerPlanItem& dinner = g_cache.dinners[i];
    if (!dinner.used) continue;

    fitTextToWidth(dinner.title, titles[i], sizeof(titles[i]), maxTitleW, FONT_B9);
    int rowW = labelW + labelGap + textWidth(titles[i], FONT_B9);
    longestRowW = max(longestRowW, rowW);
  }

  const int listX = c.x + padX + max(0, (availableW - longestRowW) / 2);

  for (int i = 0; i < visibleCount; i++) {
    const DinnerPlanItem& dinner = g_cache.dinners[i];
    if (!dinner.used) continue;

    int rowY = startY + i * lineH;
    int centerY = rowY + lineH / 2;

    int16_t lx1, ly1;
    uint16_t lw, lh;
    measureText(labels[i], FONT_B9, lx1, ly1, lw, lh);
    int labelBaseline = centerY - (int)lh / 2 - ly1;
    drawLeft(listX - lx1, labelBaseline, labels[i], FONT_B9, ink);

    int16_t tx1, ty1;
    uint16_t tw, th;
    measureText(titles[i], FONT_B9, tx1, ty1, tw, th);
    int textBaseline = centerY - (int)th / 2 - ty1;
    drawLeft(listX + labelW + labelGap - tx1, textBaseline, titles[i], FONT_B9, ink);
  }
}

static void renderLarge(const Cell& c) {
  if (g_cache.count <= 0 && g_cache.dinnerCount <= 0) {
    int contentTop = drawHeader(c, g_cache.header, 28, FONT_B12);
    Cell body = c;
    body.y = contentTop;
    body.h = c.y + c.h - contentTop;
    drawEmptyState(body, "All set", emptyPhrase());
    return;
  }

  const int gapX = 14;

  int leftW = (c.w - gapX) / 2;
  int rightW = c.w - gapX - leftW;

  Cell left = c;
  left.x = c.x;
  left.y = c.y;
  left.w = leftW;
  left.h = c.h;

  Cell right = c;
  right.x = c.x + leftW + gapX;
  right.y = c.y;
  right.w = rightW;
  right.h = c.h;

  renderMedium(left);

  drawWeeklyMenu(right);
}

static void renderXL(const Cell& c) {
  if (g_cache.count <= 0) {
    int contentTop = drawHeader(c, g_cache.header, 34, FONT_B18);
    Cell body = c;
    body.y = contentTop;
    body.h = c.y + c.h - contentTop;
    drawEmptyState(body, "All set", emptyPhrase());
    return;
  }

  const int gapX = 14;
  int leftW = (c.w - gapX) / 2;
  int rightW = c.w - gapX - leftW;

  int leftX = c.x;
  int rightX = c.x + leftW + gapX;

  const int gapY = 14;
  int topH = (c.h - gapY) / 2;
  int bottomH = c.h - gapY - topH;

  Cell topLeft = c;
  topLeft.x = leftX;
  topLeft.y = c.y;
  topLeft.w = leftW;
  topLeft.h = topH;

  renderMedium(topLeft, false);

  Cell bottomLeft = c;
  bottomLeft.x = leftX;
  bottomLeft.y = c.y + topH + gapY;
  bottomLeft.w = leftW;
  bottomLeft.h = bottomH;

  int bottomTop = drawHeader(bottomLeft, "Next items", 26, FONT_B12);
  int bottomVisible = min(max(0, g_cache.count - 5), 5);
  if (bottomVisible <= 0) bottomVisible = min(g_cache.count, 5);
  int bottomStart = (g_cache.count > 5) ? 5 : 0;
  drawCenteredItemList(
    bottomLeft,
    bottomStart,
    bottomVisible,
    bottomTop,
    bottomLeft.y + bottomLeft.h - bottomTop - 12,
    FONT_B12,
    ORIGINAL_CENTERED_LIST_LINE_GAP
  );

  Cell right = c;
  right.x = rightX;
  right.y = c.y;
  right.w = rightW;
  right.h = c.h;

  int rightTop = drawHeader(right, "Grocery overview", 34, FONT_B12);
  int visibleRight = min(g_cache.count, 12);
  drawLeftItemList(right, 0, visibleRight, rightTop + 6, right.y + right.h - 22, FONT_B12);
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
    drawEmptyState(c, "Grocery List", "Could not fetch items");
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
