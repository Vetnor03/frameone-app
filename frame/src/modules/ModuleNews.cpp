#include "ModuleNews.h"

#include "Config.h"
#include "DeviceIdentity.h"
#include "DisplayCore.h"
#include "FrameText.h"
#include "NetClient.h"
#include "Theme.h"

#include "FreeSans9ptNO.h"
#include "FreeSansBold12ptNO.h"

#include <ArduinoJson.h>
#include <string.h>
#include <new>

#define NEWS_FONT_BODY (&FreeSans9pt8b)
#define NEWS_FONT_HEADER (&FreeSansBold12pt8b)

namespace ModuleNews {

static const FrameConfig* g_cfg = nullptr;
static const int MAX_NEWS_ITEMS = 14;
static const size_t NEWS_MAX_BODY_BYTES = 12288;
static const size_t NEWS_JSON_CAPACITY = 10240;
static const int NEWS_TITLE_BYTES = 224;

struct NewsItem {
  bool used = false;
  char title[NEWS_TITLE_BYTES] = {0}; // Complete source headline, never clipped.
};

struct NewsCache {
  bool loaded = false;
  bool ok = false;
  int count = 0;
  NewsItem items[MAX_NEWS_ITEMS];
};

static_assert(sizeof(NewsCache) <= 4096, "News cache exceeded memory budget");
static NewsCache* g_cache = nullptr;
static bool g_cacheAllocationAttempted = false;

#if defined(FRAME_IS_ALFRED_V1_2)
// Retain headlines in RTC RAM across Power Save deep sleep. NVS has limited
// free space and should not be written with multi-kilobyte News results.
static const uint32_t NEWS_RTC_CACHE_MAGIC = 0x4E575331UL; // "NWS1"
RTC_DATA_ATTR static NewsCache g_retainedNews;
RTC_DATA_ATTR static uint32_t g_retainedNewsMagic = 0;
#endif

static bool ensureCacheAllocated() {
  if (g_cache) return true;
#if defined(FRAME_IS_ALFRED_V1_2)
  g_cache = &g_retainedNews;
  if (g_retainedNewsMagic != NEWS_RTC_CACHE_MAGIC ||
      g_cache->count < 0 || g_cache->count > MAX_NEWS_ITEMS) {
    memset(g_cache, 0, sizeof(*g_cache));
    g_retainedNewsMagic = NEWS_RTC_CACHE_MAGIC;
  }
  return true;
#else
  if (g_cacheAllocationAttempted) return false;
  g_cacheAllocationAttempted = true;
  g_cache = new (std::nothrow) NewsCache{};
  if (!g_cache) Serial.println("News cache allocation failed");
  return g_cache != nullptr;
#endif
}

static void safeCopy(char* dst, size_t dstSize, const char* src) {
  if (!dst || dstSize == 0) return;
  if (!src) { dst[0] = '\0'; return; }
  strlcpy(dst, src, dstSize);
}

static void normalizeDisplayText(char* out, size_t outSize, const char* in) {
  FrameText::normalizeUtf8ForDisplay(out, outSize, in ? in : "");
}

static void clearCache() {
  if (g_cache) memset(g_cache, 0, sizeof(*g_cache));
}

static bool isNorwegian() {
  if (!g_cfg) return false;
  return strcmp(g_cfg->language, "no") == 0 || strcmp(g_cfg->language, "nb") == 0;
}

static const char* headerText() { return isNorwegian() ? "Nyheter" : "News"; }
static const char* emptyText() { return isNorwegian() ? "Ingen nyheter" : "No news"; }

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

static void drawLeft(int x, int baselineY, const char* text, const GFXfont* font) {
  auto& d = DisplayCore::get();
  d.setFont(font);
  d.setTextSize(1);
  d.setTextColor(Theme::ink());
  d.setCursor(x, baselineY);
  d.print(text ? text : "");
  d.setFont(nullptr);
}

static const int NEWS_MAX_WRAP_LINES = 6;
static const int NEWS_WRAP_LINE_BYTES = 128;

static int wrapTextToLines(const char* src,
                           char lines[][NEWS_WRAP_LINE_BYTES],
                           int maxLines,
                           int maxWidth,
                           const GFXfont* font,
                           bool& complete) {
  complete = false;
  if (!src || !src[0] || !lines || maxLines <= 0 || maxWidth <= 0) return 0;

  for (int i = 0; i < maxLines; ++i) lines[i][0] = '\0';

  char work[NEWS_TITLE_BYTES] = {0};
  if (strlen(src) >= sizeof(work)) return 0;
  safeCopy(work, sizeof(work), src);
  char current[NEWS_WRAP_LINE_BYTES] = {0};
  int lineCount = 0;

  char* save = nullptr;
  char* word = strtok_r(work, " ", &save);
  while (word) {
    // snprintf/safeCopy must never silently shorten a pathological long token.
    if (strlen(word) >= NEWS_WRAP_LINE_BYTES) return 0;
    char candidate[NEWS_WRAP_LINE_BYTES] = {0};
    const int written = current[0]
      ? snprintf(candidate, sizeof(candidate), "%s %s", current, word)
      : snprintf(candidate, sizeof(candidate), "%s", word);

    if (written >= 0 && written < (int)sizeof(candidate) &&
        textWidth(candidate, font) <= maxWidth) {
      safeCopy(current, sizeof(current), candidate);
    } else {
      if (current[0]) {
        if (lineCount >= maxLines) return lineCount;
        safeCopy(lines[lineCount++], NEWS_WRAP_LINE_BYTES, current);
        current[0] = '\0';
      }

      if (textWidth(word, font) <= maxWidth) {
        safeCopy(current, sizeof(current), word);
      } else {
        // Even a long single word must not be ellipsis-truncated.
        return 0;
      }
    }

    word = strtok_r(nullptr, " ", &save);
  }

  if (current[0]) {
    if (lineCount >= maxLines) return lineCount;
    safeCopy(lines[lineCount++], NEWS_WRAP_LINE_BYTES, current);
  }

  complete = true;
  return lineCount;
}

static int drawHeader(const Cell& c) {
  auto& d = DisplayCore::get();
  const char* header = headerText();
  int16_t x1, y1;
  uint16_t tw, th;
  measureText(header, NEWS_FONT_HEADER, x1, y1, tw, th);

  const int topPad = c.h <= 150 ? 20 : 26;
  const int baseline = c.y + topPad - y1;
  const int x = c.x + c.w / 2 - (int)tw / 2 - x1;

  d.setFont(NEWS_FONT_HEADER);
  d.setTextSize(1);
  d.setTextColor(Theme::ink());
  d.setCursor(x, baseline);
  d.print(header);
  d.setFont(nullptr);

  const int underlineY = baseline + y1 + (int)th + 1;
  d.fillRect(c.x + c.w / 2 - (int)tw / 2, underlineY, tw, 2, Theme::ink());
  return underlineY + 10;
}

static bool fetchNews() {
  if (!ensureCacheAllocated()) return false;
  clearCache();
  String url = String(BASE_URL) + "/api/news?limit=14&links=0&raw_titles=1";
  int code = 0;
  String body;
  const bool httpOk = NetClient::httpGetAuth(url, DeviceIdentity::getToken(), code, body);

  if (!httpOk || code != 200 || body.length() == 0 || body.length() > NEWS_MAX_BODY_BYTES) {
    Serial.printf("News HTTP failed, code=%d bytes=%u\n", code, (unsigned int)body.length());
    g_cache->loaded = true;
    g_cache->ok = false;
    return false;
  }

  DynamicJsonDocument filter(768);
  filter["ok"] = true;
  JsonObject itemFilter = filter["items"][0].to<JsonObject>();
  itemFilter["title"] = true;

  DynamicJsonDocument doc(NEWS_JSON_CAPACITY);
  DeserializationError err = deserializeJson(doc, body, DeserializationOption::Filter(filter));
  body = String();
  if (err || !(bool)(doc["ok"] | false)) {
    Serial.printf("News JSON failed: %s\n", err ? err.c_str() : "not ok");
    g_cache->loaded = true;
    g_cache->ok = false;
    return false;
  }

  JsonArray items = doc["items"].as<JsonArray>();
  int index = 0;
  if (!items.isNull()) {
    for (JsonObject row : items) {
      if (index >= MAX_NEWS_ITEMS) break;
      const char* rawTitle = row["title"] | "";
      if (!rawTitle || !rawTitle[0]) continue;

      NewsItem& item = g_cache->items[index];
      // A headline that exceeds local storage is skipped, never shown incomplete.
      if (strlen(rawTitle) >= sizeof(item.title)) continue;
      normalizeDisplayText(item.title, sizeof(item.title), rawTitle);
      if (!item.title[0]) continue;
      item.used = true;
      ++index;
    }
  }

  g_cache->count = index;
  g_cache->loaded = true;
  g_cache->ok = true;
  return true;
}

static void ensureLoaded() {
  if (!ensureCacheAllocated()) return;
  if (!g_cache->loaded) fetchNews();
}

static bool shallowLayout(const Cell& c) {
  return c.size == CELL_SMALL || (c.h <= 150 && c.w >= 500);
}

static int capacityForCell(const Cell& c) {
  if (shallowLayout(c)) return 3;
  if (c.size == CELL_MEDIUM) return 6;
  if (c.size == CELL_LARGE) return 12;
  if (c.size == CELL_XL) return 14;
  const int columns = c.w >= 600 && c.h >= 180 ? 2 : 1;
  const int rows = max(1, max(28, c.h - 60) / 28);
  return min(MAX_NEWS_ITEMS, columns * rows);
}

static void drawEmpty(const Cell& c) {
  const int contentTop = drawHeader(c);
  const char* message = emptyText();
  int16_t x1, y1;
  uint16_t tw, th;
  measureText(message, NEWS_FONT_BODY, x1, y1, tw, th);
  const int contentBottom = c.y + c.h - 10;
  const int baseline = contentTop + (contentBottom - contentTop - (int)th) / 2 - y1;
  drawLeft(c.x + (c.w - (int)tw) / 2 - x1, baseline, message, NEWS_FONT_BODY);
}

static void renderShallow(const Cell& c) {
  auto& d = DisplayCore::get();
  const int contentTop = drawHeader(c);
  const int contentBottom = c.y + c.h - 8;
  const int contentH = max(1, contentBottom - contentTop);
  const int lineStep = 21;
  const int maxLines = min(NEWS_MAX_WRAP_LINES, max(1, contentH / lineStep));
  const int candidateCount = min(g_cache->count, 3);

  // Prefer three columns; reduce to two or one if whole headlines need room.
  int visible = 0;
  int selected[3] = {0};
  for (int columns = candidateCount; columns >= 1 && visible == 0; --columns) {
    const int cellTextW = c.w / columns - 20;
    int found = 0;
    for (int i = 0; i < g_cache->count && found < columns; ++i) {
      char lines[NEWS_MAX_WRAP_LINES][NEWS_WRAP_LINE_BYTES] = {{0}};
      bool complete = false;
      const int n = wrapTextToLines(g_cache->items[i].title, lines,
                                    maxLines, cellTextW, NEWS_FONT_BODY, complete);
      if (complete && n > 0 && n * lineStep <= contentH) selected[found++] = i;
    }
    if (found == columns) visible = found;
  }
  if (!visible) { drawEmpty(c); return; }

  for (int i = 1; i < visible; ++i) {
    const int x = c.x + (c.w * i) / visible;
    d.drawFastVLine(x, contentTop + 6, max(4, contentH - 12), Theme::ink());
  }

  for (int i = 0; i < visible; ++i) {
    const int x0 = c.x + (c.w * i) / visible;
    const int x1Cell = c.x + (c.w * (i + 1)) / visible;
    const int width = x1Cell - x0;
    char lines[NEWS_MAX_WRAP_LINES][NEWS_WRAP_LINE_BYTES] = {{0}};
    bool complete = false;
    const int lineCount = wrapTextToLines(
      g_cache->items[selected[i]].title, lines, maxLines,
      width - 20, NEWS_FONT_BODY, complete
    );
    if (!complete || lineCount <= 0) continue;
    const int blockH = lineCount * lineStep;
    const int startY = contentTop + max(0, (contentH - blockH) / 2);
    for (int line = 0; line < lineCount; ++line) {
      int16_t tx1, ty1;
      uint16_t tw, th;
      measureText(lines[line], NEWS_FONT_BODY, tx1, ty1, tw, th);
      const int centerY = startY + line * lineStep + lineStep / 2;
      const int baseline = centerY - (int)th / 2 - ty1;
      drawLeft(x0 + (width - (int)tw) / 2 - tx1, baseline, lines[line], NEWS_FONT_BODY);
    }
  }
}

static void renderList(const Cell& c) {
  auto& d = DisplayCore::get();
  const int contentTop = drawHeader(c);
  const int contentBottom = c.y + c.h - 12;
  if (g_cache->count <= 0) { drawEmpty(c); return; }

  // Match the Reminders module's centered list treatment. Wrap complete
  // original headlines and show as many newest stories as actually fit in the
  // available height. Never draw a partial sentence or append ellipses.
  const int dotR = 3;
  const int gap = 10;
  const int sidePad = 18;
  const int lineStep = 21;
  const int itemGap = 7;
  const int candidateCount = min(g_cache->count, capacityForCell(c));
  const int maxTextW = max(24, c.w - sidePad * 2 - dotR * 2 - gap);
  const int availableH = max(1, contentBottom - contentTop);

  int visible = 0;
  int selected[MAX_NEWS_ITEMS] = {0};
  int usedH = 0;
  int maxLineW = 0;

  for (int i = 0; i < candidateCount; ++i) {
    char lines[NEWS_MAX_WRAP_LINES][NEWS_WRAP_LINE_BYTES] = {{0}};
    bool complete = false;
    const int lineCount = wrapTextToLines(
      g_cache->items[i].title,
      lines, NEWS_MAX_WRAP_LINES, maxTextW, NEWS_FONT_BODY, complete
    );
    if (!complete || lineCount <= 0) continue;

    const int itemH = lineCount * lineStep;
    const int nextH = usedH + (visible > 0 ? itemGap : 0) + itemH;
    if (nextH > availableH) {
      if (!visible) continue; // A too-long first story cannot hide every other story.
      break;
    }

    for (int line = 0; line < lineCount; ++line) {
      const int lineW = textWidth(lines[line], NEWS_FONT_BODY);
      if (lineW > maxLineW) maxLineW = lineW;
    }
    usedH = nextH;
    selected[visible++] = i;
  }

  if (visible <= 0) return;

  const bool drawBullets = visible > 1;
  const int bulletSpace = drawBullets ? dotR * 2 + gap : 0;
  const int rowW = bulletSpace + maxLineW;
  int textX = c.x + (c.w - rowW) / 2 + bulletSpace;
  const int minTextX = c.x + sidePad + bulletSpace;
  if (textX < minTextX) textX = minTextX;
  const int bulletX = drawBullets ? textX - gap - dotR : textX;
  int y = contentTop + max(0, (availableH - usedH) / 2);

  for (int i = 0; i < visible; ++i) {
    char lines[NEWS_MAX_WRAP_LINES][NEWS_WRAP_LINE_BYTES] = {{0}};
    bool complete = false;
    const int lineCount = wrapTextToLines(
      g_cache->items[selected[i]].title,
      lines, NEWS_MAX_WRAP_LINES, maxTextW, NEWS_FONT_BODY, complete
    );
    if (!complete || lineCount <= 0) break;

    if (i > 0) y += itemGap;
    if (drawBullets) d.fillCircle(bulletX, y + lineStep / 2, dotR, Theme::ink());

    for (int line = 0; line < lineCount; ++line) {
      int16_t tx1, ty1;
      uint16_t tw, th;
      measureText(lines[line], NEWS_FONT_BODY, tx1, ty1, tw, th);
      const int centerY = y + line * lineStep + lineStep / 2;
      const int baseline = centerY - (int)th / 2 - ty1;
      drawLeft(textX - tx1, baseline, lines[line], NEWS_FONT_BODY);
    }
    y += lineCount * lineStep;
  }
}

void setConfig(const FrameConfig* cfg) {
  // Language is read from g_cfg at draw time. A config/layout redraw does not
  // make the already fetched NRK headlines stale.
  g_cfg = cfg;
}

void invalidate() {
  // News only needs a new source fetch when its visible content actually
  // changed, or the app's explicit Update button requests fresh content.
  if (g_cache) g_cache->loaded = false;
}

void preload() { ensureLoaded(); }

void render(const Cell& c, const String&) {
  ensureLoaded();
  if (!g_cache || !g_cache->ok || g_cache->count <= 0) { drawEmpty(c); return; }
  if (shallowLayout(c)) renderShallow(c);
  else renderList(c);
}

} // namespace ModuleNews
