#include "ModuleStocks.h"
#include "DisplayCore.h"
#include "Theme.h"
#include "Config.h"
#include "DeviceIdentity.h"
#include "NetClient.h"

#include <ArduinoJson.h>
#include <math.h>
#include <string.h>

#include "Fonts/FreeSans9ptNO.h"
#include "Fonts/FreeSansBold12ptNO.h"
#include "Fonts/FreeSansBold18ptNO.h"

#define FONT_B9  (&FreeSans9pt8b)
#define FONT_B12 (&FreeSansBold12pt8b)
#define FONT_B18 (&FreeSansBold18pt8b)

namespace ModuleStocks {

static const FrameConfig* g_cfg = nullptr;
static const int MAX_INSTANCES = 4;

struct StockInstanceConfig {
  uint8_t id = 1;
  char symbol[24] = {0};
  char name[48] = {0};
  uint32_t refreshMs = 900000UL;
};

struct StockCache {
  bool valid = false;
  bool fetchAttempted = false;
  bool lastFetchFailed = false;
  uint32_t fetchedAtMs = 0;

  char symbol[24] = {0};
  char name[48] = {0};
  char currency[8] = {0};

  float price = NAN;
  float change = NAN;
  float changePercent = NAN;
};

static StockInstanceConfig g_inst[MAX_INSTANCES];
static StockCache g_cache[MAX_INSTANCES];

static uint8_t parseInstanceId(const String& moduleName) {
  int idx = moduleName.indexOf(':');
  if (idx < 0) return 1;
  int id = moduleName.substring(idx + 1).toInt();
  if (id < 1) id = 1;
  if (id > 255) id = 255;
  return (uint8_t)id;
}

static int findInstIndexById(uint8_t id) {
  for (int i = 0; i < MAX_INSTANCES; i++) {
    if (g_inst[i].id == id && (g_inst[i].symbol[0] || g_inst[i].name[0])) {
      return i;
    }
  }
  return -1;
}

static void measureText(const char* text, const GFXfont* font,
                        int16_t& x1, int16_t& y1, uint16_t& w, uint16_t& h) {
  auto& d = DisplayCore::get();
  d.setFont(font);
  d.setTextSize(1);
  d.getTextBounds(text ? text : "", 0, 0, &x1, &y1, &w, &h);
}

static int textWidth(const char* text, const GFXfont* font) {
  int16_t x1, y1;
  uint16_t tw, th;
  measureText(text, font, x1, y1, tw, th);
  return (int)tw;
}

static void drawLeft(int x, int baselineY, const char* text, const GFXfont* font, uint16_t col) {
  auto& d = DisplayCore::get();
  d.setFont(font);
  d.setTextColor(col);
  d.setTextSize(1);
  d.setCursor(x, baselineY);
  d.print(text ? text : "");
  d.setFont(nullptr);
  d.setTextSize(1);
}

static void drawCenteredLine(int x, int y, int w, int h,
                             const char* text,
                             const GFXfont* font,
                             uint16_t color) {
  auto& d = DisplayCore::get();

  int16_t x1, y1;
  uint16_t tw, th;
  measureText(text, font, x1, y1, tw, th);

  int bx = x + (w - (int)tw) / 2;
  int by = y + (h - (int)th) / 2;

  d.setTextColor(color);
  d.setFont(font);
  d.setTextSize(1);
  d.setCursor(bx - x1, by - y1);
  d.print(text ? text : "");

  d.setFont(nullptr);
  d.setTextSize(1);
}

static void fitTextToWidth(const char* src, char* dst, size_t dstSize, int maxWidth, const GFXfont* font) {
  if (!dst || dstSize == 0) return;
  dst[0] = 0;

  if (!src || !src[0]) return;

  if (textWidth(src, font) <= maxWidth) {
    strlcpy(dst, src, dstSize);
    return;
  }

  const char* ell = "...";
  int srcLen = (int)strlen(src);
  for (int n = srcLen; n >= 1; n--) {
    char buf[96] = {0};
    int take = n;
    if (take > (int)sizeof(buf) - 4) take = (int)sizeof(buf) - 4;
    memcpy(buf, src, take);
    buf[take] = 0;
    strcat(buf, ell);
    if (textWidth(buf, font) <= maxWidth) {
      strlcpy(dst, buf, dstSize);
      return;
    }
  }

  strlcpy(dst, ell, dstSize);
}

static void formatPrice(char* out, size_t n, float price) {
  if (!out || n == 0) return;
  if (!isfinite(price)) {
    strlcpy(out, "--", n);
    return;
  }

  if (fabsf(price) >= 1000.0f) {
    snprintf(out, n, "%.0f", price);
  } else {
    snprintf(out, n, "%.2f", price);
  }
}

static void formatSigned(char* out, size_t n, float v, int decimals, bool withPercent) {
  if (!out || n == 0) return;
  if (!isfinite(v)) {
    strlcpy(out, "--", n);
    return;
  }

  const char* sign = v > 0 ? "+" : "";
  if (withPercent) {
    if (decimals <= 0) snprintf(out, n, "%s%.0f%%", sign, v);
    else snprintf(out, n, "%s%.2f%%", sign, v);
  } else {
    if (decimals <= 0) snprintf(out, n, "%s%.0f", sign, v);
    else snprintf(out, n, "%s%.2f", sign, v);
  }
}

static bool cfgChanged(const StockInstanceConfig& oldCfg, const StocksModuleConfig& next) {
  if (oldCfg.id != next.id) return true;
  if (oldCfg.refreshMs != next.refreshMs) return true;
  if (strcmp(oldCfg.symbol, next.symbol) != 0) return true;
  if (strcmp(oldCfg.name, next.name) != 0) return true;
  return false;
}

static void applyConfigFromFrameConfig() {
  for (int i = 0; i < MAX_INSTANCES; i++) {
    g_inst[i] = StockInstanceConfig();
  }

  if (!g_cfg) return;

  for (int i = 0; i < (int)g_cfg->stocksCount && i < MAX_INSTANCES; i++) {
    const StocksModuleConfig& src = g_cfg->stocks[i];
    if (src.id < 1) continue;

    const int dstIdx = i;
    StockInstanceConfig oldCfg = g_inst[dstIdx];

    g_inst[dstIdx].id = src.id;
    g_inst[dstIdx].refreshMs = src.refreshMs;

    if (src.symbol[0]) strlcpy(g_inst[dstIdx].symbol, src.symbol, sizeof(g_inst[dstIdx].symbol));
    if (src.name[0]) strlcpy(g_inst[dstIdx].name, src.name, sizeof(g_inst[dstIdx].name));

    if (cfgChanged(oldCfg, src)) {
      g_cache[dstIdx] = StockCache();
    }
  }
}

static bool parseQuoteJson(const String& body, StockCache& out) {
  StaticJsonDocument<8192> doc;
  DeserializationError err = deserializeJson(doc, body);
  if (err) return false;

  const char* symbol = doc["symbol"] | "";
  const char* name = doc["name"] | "";
  const char* currency = doc["currency"] | "";

  if (symbol && symbol[0]) strlcpy(out.symbol, symbol, sizeof(out.symbol));
  if (name && name[0]) strlcpy(out.name, name, sizeof(out.name));
  if (currency && currency[0]) strlcpy(out.currency, currency, sizeof(out.currency));

  out.price = doc["quote"]["price"] | NAN;
  out.change = doc["quote"]["change"] | NAN;
  out.changePercent = doc["quote"]["changePercent"] | NAN;

  return true;
}

static bool fetchQuote(int idx, StockCache& out) {
  const StockInstanceConfig& cfg = g_inst[idx];
  if (!cfg.id) return false;

  String url = String(BASE_URL)
             + "/api/device/stocks?device_id="
             + DeviceIdentity::getDeviceId()
             + "&id="
             + String((int)cfg.id);

  int code = 0;
  String body;
  bool ok = NetClient::httpGetAuth(url, DeviceIdentity::getToken(), code, body);

  if (code == 401 || code == 403) {
    DeviceIdentity::clearToken();
  }

  if (!ok || code != 200 || body.length() == 0) {
    return false;
  }

  return parseQuoteJson(body, out);
}

static void tick(int idx) {
  StockInstanceConfig& cfg = g_inst[idx];
  StockCache& cache = g_cache[idx];

  if (!cfg.symbol[0] && !cfg.name[0]) return;

  const uint32_t now = millis();
  bool needs = (!cache.valid) || ((now - cache.fetchedAtMs) > cfg.refreshMs);
  if (!needs) return;

  StockCache fresh = cache;
  bool fetched = fetchQuote(idx, fresh);

  cache.fetchAttempted = true;

  if (!fetched) {
    cache.lastFetchFailed = true;
    return;
  }

  cache.lastFetchFailed = false;
  cache.fetchedAtMs = now;

  if (isfinite(fresh.price)) {
    fresh.valid = true;
    fresh.fetchAttempted = true;
    fresh.lastFetchFailed = false;
    fresh.fetchedAtMs = now;
    cache = fresh;
    return;
  }

  cache.valid = false;
}

static void drawPlaceholder(const Cell& c, const StockInstanceConfig& cfg) {
  const char* mainLine = cfg.name[0] ? cfg.name : cfg.symbol;
  if (!mainLine || !mainLine[0]) {
    drawCenteredLine(c.x, c.y, c.w, c.h, "No stock", FONT_B12, Theme::ink());
    return;
  }

  if (c.size == CELL_SMALL) {
    drawCenteredLine(c.x, c.y, c.w, c.h, mainLine, FONT_B12, Theme::ink());
    return;
  }

  int topH = c.h / 2;
  int bottomH = c.h - topH;

  drawCenteredLine(c.x, c.y, c.w, topH, mainLine, FONT_B12, Theme::ink());
  if (cfg.symbol[0] && (!cfg.name[0] || strcmp(cfg.name, cfg.symbol) != 0)) {
    drawCenteredLine(c.x, c.y + topH, c.w, bottomH, cfg.symbol, FONT_B9, Theme::ink());
  }
}

static void drawLive(const Cell& c, const StockCache& data) {
  const char* title = data.name[0] ? data.name : data.symbol;

  char priceTxt[24] = {0};
  char changeTxt[20] = {0};
  char pctTxt[20] = {0};

  formatPrice(priceTxt, sizeof(priceTxt), data.price);
  formatSigned(changeTxt, sizeof(changeTxt), data.change, 2, false);
  formatSigned(pctTxt, sizeof(pctTxt), data.changePercent, 2, true);

  if (c.size == CELL_SMALL) {
    int topH = c.h / 2;
    drawCenteredLine(c.x, c.y, c.w, topH, data.symbol[0] ? data.symbol : title, FONT_B9, Theme::ink());
    drawCenteredLine(c.x, c.y + topH, c.w, c.h - topH, priceTxt, FONT_B12, Theme::ink());
    return;
  }

  if (c.size == CELL_MEDIUM) {
    int rowH = c.h / 3;
    drawCenteredLine(c.x, c.y, c.w, rowH, title, FONT_B9, Theme::ink());
    drawCenteredLine(c.x, c.y + rowH, c.w, rowH, priceTxt, FONT_B18, Theme::ink());
    drawCenteredLine(c.x, c.y + rowH * 2, c.w, c.h - rowH * 2, pctTxt, FONT_B12, Theme::ink());
    return;
  }

  int left = c.x + 12;
  int y1 = c.y + 28;
  int y2 = c.y + (c.h / 2);
  int y3 = c.y + c.h - 14;

  char titleFit[56] = {0};
  fitTextToWidth(title, titleFit, sizeof(titleFit), c.w - 24, FONT_B12);

  drawLeft(left, y1, titleFit, FONT_B12, Theme::ink());
  drawLeft(left, y2, priceTxt, FONT_B18, Theme::ink());

  char bottom[48] = {0};
  if (data.currency[0]) {
    snprintf(bottom, sizeof(bottom), "%s  (%s)  %s", changeTxt, pctTxt, data.currency);
  } else {
    snprintf(bottom, sizeof(bottom), "%s  (%s)", changeTxt, pctTxt);
  }
  drawLeft(left, y3, bottom, FONT_B9, Theme::ink());
}

void setConfig(const FrameConfig* cfg) {
  g_cfg = cfg;
  applyConfigFromFrameConfig();
}

void render(const Cell& c, const String& moduleName) {
  const uint8_t id = parseInstanceId(moduleName);
  int idx = findInstIndexById(id);

  if (idx < 0 || idx >= MAX_INSTANCES) {
    drawCenteredLine(c.x, c.y, c.w, c.h, "No stock", FONT_B12, Theme::ink());
    return;
  }

  tick(idx);

  const StockInstanceConfig& cfg = g_inst[idx];
  const StockCache& cache = g_cache[idx];

  if (cache.valid && isfinite(cache.price)) {
    drawLive(c, cache);
    return;
  }

  if (cache.fetchAttempted && cache.lastFetchFailed) {
    drawCenteredLine(c.x, c.y, c.w, c.h, "Stock unavailable", FONT_B12, Theme::ink());
    return;
  }

  drawPlaceholder(c, cfg);
}

} // namespace ModuleStocks
