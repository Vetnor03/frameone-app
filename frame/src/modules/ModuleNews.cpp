#include "ModuleNews.h"

#include "Config.h"
#include "DeviceIdentity.h"
#include "DisplayCore.h"
#include "FrameText.h"
#include "NetClient.h"
#include "Theme.h"

#include "FreeSansBold12ptNO.h"

#include <ArduinoJson.h>
#include <string.h>
#include <new>

#define NEWS_FONT_BODY (&FreeSansBold12pt8b)
#define NEWS_FONT_HEADER (&FreeSansBold12pt8b)

namespace ModuleNews {

static const FrameConfig* g_cfg = nullptr;
static const int MAX_NEWS_ITEMS = 14;
static const size_t NEWS_MAX_BODY_BYTES = 12288;
static const size_t NEWS_JSON_CAPACITY = 10240;

struct NewsItem {
  bool used = false;
  char title[112] = {0};
  char compact[64] = {0};
  char standard[96] = {0};
};

struct NewsCache {
  bool loaded = false;
  bool ok = false;
  int count = 0;
  NewsItem items[MAX_NEWS_ITEMS];
};

static_assert(sizeof(NewsCache) <= 4096, "News cache exceeded heap budget");
static NewsCache* g_cache = nullptr;
static bool g_cacheAllocationAttempted = false;

static bool ensureCacheAllocated() {
  if (g_cache) return true;
  if (g_cacheAllocationAttempted) return false;
  g_cacheAllocationAttempted = true;
  g_cache = new (std::nothrow) NewsCache{};
  if (!g_cache) Serial.println("News cache allocation failed");
  return g_cache != nullptr;
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

static void fitTextToWidth(const char* src, char* dst, size_t dstSize, int maxWidth, const GFXfont* font) {
  if (!dst || dstSize == 0) return;
  dst[0] = '\0';
  if (!src || !src[0] || maxWidth <= 0) return;
  if (textWidth(src, font) <= maxWidth) { safeCopy(dst, dstSize, src); return; }

  const int srcLen = (int)strlen(src);
  for (int n = srcLen; n >= 1; --n) {
    char buf[128] = {0};
    const int take = min(n, (int)sizeof(buf) - 4);
    memcpy(buf, src, take);
    buf[take] = '\0';
    while (strlen(buf) > 0 && buf[strlen(buf) - 1] == ' ') buf[strlen(buf) - 1] = '\0';
    strlcat(buf, "...", sizeof(buf));
    if (textWidth(buf, font) <= maxWidth) { safeCopy(dst, dstSize, buf); return; }
  }
  safeCopy(dst, dstSize, "...");
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

static const char* displayTitle(const NewsItem& item, bool compact) {
  if (compact && item.compact[0]) return item.compact;
  if (!compact && item.standard[0]) return item.standard;
  return item.title;
}

static bool fetchNews() {
  if (!ensureCacheAllocated()) return false;
  clearCache();
  String url = String(BASE_URL) + "/api/news?limit=14&links=0&display_profiles=compact,standard";
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
  itemFilter["profile_titles"]["compact"] = true;
  itemFilter["profile_titles"]["standard"] = true;

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
      item.used = true;
      normalizeDisplayText(item.title, sizeof(item.title), rawTitle);
      normalizeDisplayText(item.compact, sizeof(item.compact), row["profile_titles"]["compact"] | rawTitle);
      normalizeDisplayText(item.standard, sizeof(item.standard), row["profile_titles"]["standard"] | rawTitle);
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
  const int visible = min(g_cache->count, 3);
  if (visible <= 0) { drawEmpty(c); return; }

  const int contentBottom = c.y + c.h - 8;
  const int contentH = max(1, contentBottom - contentTop);
  for (int i = 1; i < visible; ++i) {
    const int x = c.x + (c.w * i) / visible;
    d.drawFastVLine(x, contentTop + 6, max(4, contentH - 12), Theme::ink());
  }

  for (int i = 0; i < visible; ++i) {
    const int x0 = c.x + (c.w * i) / visible;
    const int x1Cell = c.x + (c.w * (i + 1)) / visible;
    const int width = x1Cell - x0;
    char fit[96] = {0};
    fitTextToWidth(displayTitle(g_cache->items[i], true), fit, sizeof(fit), width - 20, NEWS_FONT_BODY);

    int16_t tx1, ty1;
    uint16_t tw, th;
    measureText(fit, NEWS_FONT_BODY, tx1, ty1, tw, th);
    const int baseline = contentTop + (contentH - (int)th) / 2 - ty1;
    drawLeft(x0 + (width - (int)tw) / 2 - tx1, baseline, fit, NEWS_FONT_BODY);
  }
}

static void renderList(const Cell& c) {
  auto& d = DisplayCore::get();
  const int contentTop = drawHeader(c);
  const int contentBottom = c.y + c.h - 12;
  const int visible = min(g_cache->count, capacityForCell(c));
  if (visible <= 0) { drawEmpty(c); return; }

  // Match the Reminders module's centered list treatment: bold content,
  // compact bullets only when there is more than one item, and a centered
  // block that uses the full cell instead of reserving secondary date-panel space.
  const int dotR = 3;
  const int gap = 10;
  const int sidePad = 18;
  const bool drawBullets = visible > 1;
  const int bulletSpace = drawBullets ? dotR * 2 + gap : 0;
  const int maxTextW = max(24, c.w - sidePad * 2 - bulletSpace);

  int maxLineW = 0;
  for (int i = 0; i < visible; ++i) {
    char fit[112] = {0};
    fitTextToWidth(displayTitle(g_cache->items[i], false),
                   fit, sizeof(fit), maxTextW, NEWS_FONT_BODY);
    const int lineW = textWidth(fit, NEWS_FONT_BODY);
    if (lineW > maxLineW) maxLineW = lineW;
  }

  const int availableH = max(1, contentBottom - contentTop);
  const int rowStep = min(28, max(20, availableH / max(1, visible)));
  const int blockH = rowStep * visible;
  const int startY = contentTop + max(0, (availableH - blockH) / 2);

  const int rowW = bulletSpace + maxLineW;
  int textX = c.x + (c.w - rowW) / 2 + bulletSpace;
  const int minTextX = c.x + sidePad + bulletSpace;
  if (textX < minTextX) textX = minTextX;
  const int bulletX = drawBullets ? textX - gap - dotR : textX;

  for (int i = 0; i < visible; ++i) {
    char fit[112] = {0};
    fitTextToWidth(displayTitle(g_cache->items[i], false),
                   fit, sizeof(fit), maxTextW, NEWS_FONT_BODY);

    int16_t tx1, ty1;
    uint16_t tw, th;
    measureText(fit, NEWS_FONT_BODY, tx1, ty1, tw, th);

    const int centerY = startY + i * rowStep + rowStep / 2;
    const int baseline = centerY - (int)th / 2 - ty1;
    if (drawBullets) d.fillCircle(bulletX, centerY, dotR, Theme::ink());
    drawLeft(textX - tx1, baseline, fit, NEWS_FONT_BODY);
  }
}

void setConfig(const FrameConfig* cfg) { g_cfg = cfg; clearCache(); }
void preload() { fetchNews(); }

void render(const Cell& c, const String&) {
  ensureLoaded();
  if (!g_cache || !g_cache->ok || g_cache->count <= 0) { drawEmpty(c); return; }
  if (shallowLayout(c)) renderShallow(c);
  else renderList(c);
}

} // namespace ModuleNews
