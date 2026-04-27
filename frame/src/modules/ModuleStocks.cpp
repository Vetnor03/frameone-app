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
static const int MAX_SERIES_POINTS = 64;

struct StockInstanceConfig {
  uint8_t id = 1;
  char symbol[24] = {0};
  char name[48] = {0};
  char chartRange[8] = "day";
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
  float previousClose = NAN;
  float open = NAN;
  float high = NAN;
  float low = NAN;

  char chartRange[8] = {0};
  uint8_t seriesCount = 0;
  float series[MAX_SERIES_POINTS] = {0};
};

static StockInstanceConfig* g_inst = nullptr;
static StockCache* g_cache = nullptr;
static bool g_stateReady = false;

static bool ensureState() {
  if (g_stateReady && g_inst && g_cache) return true;

  if (!g_inst) {
    g_inst = new StockInstanceConfig[MAX_INSTANCES];
    if (!g_inst) return false;
  }

  if (!g_cache) {
    g_cache = new StockCache[MAX_INSTANCES];
    if (!g_cache) return false;
  }

  for (int i = 0; i < MAX_INSTANCES; i++) {
    g_inst[i] = StockInstanceConfig();
    g_cache[i] = StockCache();
  }
  g_stateReady = true;
  return true;
}

static uint8_t parseInstanceId(const String& moduleName) {
  int idx = moduleName.indexOf(':');
  if (idx < 0) return 1;
  int id = moduleName.substring(idx + 1).toInt();
  if (id < 1) id = 1;
  if (id > 255) id = 255;
  return (uint8_t)id;
}

static int findInstIndexById(uint8_t id) {
  if (!g_stateReady || !g_inst) return -1;
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

static void drawChartBox(int x, int y, int w, int h, const StockCache& data) {
  auto& d = DisplayCore::get();
  d.drawRect(x, y, w, h, Theme::ink());
  if (w <= 6 || h <= 6 || data.seriesCount < 2) {
    drawCenteredLine(x, y, w, h, "No chart data", FONT_B9, Theme::ink());
    return;
  }

  const int innerX = x + 2;
  const int innerY = y + 2;
  const int innerW = w - 4;
  const int innerH = h - 4;

  float mn = data.series[0];
  float mx = data.series[0];
  for (uint8_t i = 1; i < data.seriesCount; i++) {
    if (data.series[i] < mn) mn = data.series[i];
    if (data.series[i] > mx) mx = data.series[i];
  }
  float span = mx - mn;
  if (span < 0.0001f) span = 1.0f;

  d.drawFastHLine(innerX, innerY + innerH / 2, innerW, Theme::ink());

  const int n = (int)data.seriesCount;
  int prevX = innerX;
  int prevY = innerY + innerH - (int)roundf(((data.series[0] - mn) / span) * (float)(innerH - 1));
  for (int i = 1; i < n; i++) {
    int px = innerX + (i * (innerW - 1)) / (n - 1);
    int py = innerY + innerH - (int)roundf(((data.series[i] - mn) / span) * (float)(innerH - 1));
    d.drawLine(prevX, prevY, px, py, Theme::ink());
    prevX = px;
    prevY = py;
  }
}

static bool cfgChanged(const StockInstanceConfig& oldCfg, const StocksModuleConfig& next) {
  if (oldCfg.id != next.id) return true;
  if (oldCfg.refreshMs != next.refreshMs) return true;
  if (strcmp(oldCfg.symbol, next.symbol) != 0) return true;
  if (strcmp(oldCfg.name, next.name) != 0) return true;
  if (strcmp(oldCfg.chartRange, next.chartRange) != 0) return true;
  return false;
}

static const char* normalizeRange(const char* raw) {
  if (!raw || !raw[0]) return "day";
  if (strcmp(raw, "week") == 0) return "week";
  if (strcmp(raw, "month") == 0) return "month";
  if (strcmp(raw, "year") == 0) return "year";
  return "day";
}

static void applyConfigFromFrameConfig() {
  if (!ensureState()) return;

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
    strlcpy(g_inst[dstIdx].chartRange, normalizeRange(src.chartRange), sizeof(g_inst[dstIdx].chartRange));

    if (cfgChanged(oldCfg, src)) {
      g_cache[dstIdx] = StockCache();
    }
  }
}

static bool parseSeriesArray(JsonVariantConst arrVar, StockCache& out) {
  JsonArrayConst arr = arrVar.as<JsonArrayConst>();
  if (arr.isNull()) return false;
  for (JsonVariantConst v : arr) {
    if (out.seriesCount >= MAX_SERIES_POINTS) break;
    float p = NAN;
    if (v.is<float>() || v.is<double>() || v.is<long>() || v.is<int>()) {
      p = (float)v.as<double>();
    } else {
      p = v["p"] | NAN;
      if (!isfinite(p)) p = v["price"] | NAN;
    }
    if (!isfinite(p)) continue;
    out.series[out.seriesCount++] = p;
  }
  return out.seriesCount > 0;
}

static bool parseQuoteJson(const String& body, const StockInstanceConfig& cfg, StockCache& out) {
  DynamicJsonDocument doc((size_t)body.length() + 2048);
  DeserializationError err = deserializeJson(doc, body);
  if (err) {
    Serial.print("[STOCKS] JSON parse failed: ");
    Serial.println(err.c_str());
    return false;
  }

  const char* symbol = doc["symbol"] | "";
  const char* name = doc["name"] | "";
  const char* currency = doc["currency"] | "";
  const char* chartRange = doc["chartRange"] | "";

  if (symbol && symbol[0]) strlcpy(out.symbol, symbol, sizeof(out.symbol));
  if (name && name[0]) strlcpy(out.name, name, sizeof(out.name));
  if (currency && currency[0]) strlcpy(out.currency, currency, sizeof(out.currency));
  if (chartRange && chartRange[0]) strlcpy(out.chartRange, normalizeRange(chartRange), sizeof(out.chartRange));
  else strlcpy(out.chartRange, normalizeRange(cfg.chartRange), sizeof(out.chartRange));

  out.price = doc["quote"]["price"] | NAN;
  out.change = doc["quote"]["change"] | NAN;
  out.changePercent = doc["quote"]["changePercent"] | NAN;
  out.previousClose = doc["quote"]["previousClose"] | NAN;
  out.open = doc["quote"]["open"] | NAN;
  out.high = doc["quote"]["high"] | NAN;
  out.low = doc["quote"]["low"] | NAN;

  if (!isfinite(out.price)) out.price = doc["quote"]["c"] | NAN;
  if (!isfinite(out.change)) out.change = doc["quote"]["d"] | NAN;
  if (!isfinite(out.changePercent)) out.changePercent = doc["quote"]["dp"] | NAN;
  if (!isfinite(out.previousClose)) out.previousClose = doc["quote"]["pc"] | NAN;
  if (!isfinite(out.open)) out.open = doc["quote"]["o"] | NAN;
  if (!isfinite(out.high)) out.high = doc["quote"]["h"] | NAN;
  if (!isfinite(out.low)) out.low = doc["quote"]["l"] | NAN;

  out.seriesCount = 0;
  bool parsedSeries = parseSeriesArray(doc["selectedSeries"], out);
  if (!parsedSeries) {
    parsedSeries = parseSeriesArray(doc["series"][out.chartRange], out);
  }
  if (!parsedSeries) {
    parsedSeries = parseSeriesArray(doc["series"][normalizeRange(cfg.chartRange)], out);
  }
  if (!parsedSeries) {
    parseSeriesArray(doc["series"]["day"], out);
  }

  Serial.print("[STOCKS] Parsed symbol/name: ");
  Serial.print(out.symbol);
  Serial.print(" / ");
  Serial.println(out.name);
  Serial.print("[STOCKS] Parsed quote p/d/dp: ");
  Serial.print(out.price, 4);
  Serial.print(" / ");
  Serial.print(out.change, 4);
  Serial.print(" / ");
  Serial.println(out.changePercent, 4);
  Serial.print("[STOCKS] selectedSeries count: ");
  Serial.println(out.seriesCount);

  return true;
}

static bool fetchQuote(int idx, StockCache& out) {
  if (!g_stateReady || !g_inst) return false;
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
  Serial.print("[STOCKS] URL: ");
  Serial.println(url);
  Serial.print("[STOCKS] HTTP code: ");
  Serial.println(code);
  Serial.print("[STOCKS] body bytes: ");
  Serial.println(body.length());

  if (code == 401 || code == 403) {
    DeviceIdentity::clearToken();
  }

  if (!ok || code != 200 || body.length() == 0) {
    return false;
  }

  return parseQuoteJson(body, cfg, out);
}

static void tick(int idx) {
  if (!g_stateReady || !g_inst || !g_cache) return;
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
    const bool wasValid = cache.valid;
    fresh.valid = true;
    fresh.fetchAttempted = true;
    fresh.lastFetchFailed = false;
    fresh.fetchedAtMs = now;
    cache = fresh;
    Serial.print("[STOCKS] cache.valid became true: ");
    Serial.println((!wasValid && cache.valid) ? "true" : "false");
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

  char openTxt[24] = {0};
  char highTxt[24] = {0};
  char lowTxt[24] = {0};
  char prevCloseTxt[24] = {0};
  formatPrice(openTxt, sizeof(openTxt), data.open);
  formatPrice(highTxt, sizeof(highTxt), data.high);
  formatPrice(lowTxt, sizeof(lowTxt), data.low);
  formatPrice(prevCloseTxt, sizeof(prevCloseTxt), data.previousClose);

  const int pad = (c.size == CELL_MEDIUM) ? 8 : 12;
  const int headerH = (c.size == CELL_MEDIUM) ? 42 : 58;
  const int chartBottomPad = (c.size == CELL_MEDIUM) ? 54 : 74;
  const int chartY = c.y + headerH;
  const int chartH = c.h - headerH - chartBottomPad;
  const int priceBase = c.y + c.h - ((c.size == CELL_MEDIUM) ? 28 : 38);
  const int deltaBase = c.y + c.h - 10;

  char titleFit[64] = {0};
  fitTextToWidth(title, titleFit, sizeof(titleFit), c.w - (pad * 2) - 140, FONT_B12);
  drawLeft(c.x + pad, c.y + 16, titleFit, FONT_B12, Theme::ink());

  char headRight[40] = {0};
  snprintf(headRight, sizeof(headRight), "%s  %s", changeTxt, pctTxt);
  int hw = textWidth(headRight, FONT_B12);
  drawLeft(c.x + c.w - pad - hw, c.y + 16, headRight, FONT_B12, Theme::ink());

  if (c.size == CELL_MEDIUM) {
    char row1[48] = {0};
    snprintf(row1, sizeof(row1), "O %s  H %s", openTxt, highTxt);
    drawLeft(c.x + pad, c.y + 34, row1, FONT_B9, Theme::ink());

    int chartX = c.x + pad;
    int chartW = c.w - pad * 2;
    drawChartBox(chartX, chartY, chartW, chartH, data);

    drawLeft(c.x + pad, priceBase, priceTxt, FONT_B18, Theme::ink());
    char footer[40] = {0};
    snprintf(footer, sizeof(footer), "Low %s", lowTxt);
    drawLeft(c.x + pad, deltaBase, footer, FONT_B9, Theme::ink());
    return;
  }

  auto& d = DisplayCore::get();
  if (c.size == CELL_LARGE) {
    const int splitX = c.x + (c.w * 50) / 100;
    char row1[40] = {0}, row2[40] = {0}, row3[40] = {0};
    snprintf(row1, sizeof(row1), "Open  %s", openTxt);
    snprintf(row2, sizeof(row2), "High  %s", highTxt);
    snprintf(row3, sizeof(row3), "Low   %s", lowTxt);
    drawLeft(c.x + pad, c.y + 34, row1, FONT_B9, Theme::ink());
    drawLeft(c.x + pad, c.y + 50, row2, FONT_B9, Theme::ink());
    drawLeft(c.x + pad, c.y + 66, row3, FONT_B9, Theme::ink());

    d.drawFastVLine(splitX, c.y + headerH - 10, 82, Theme::ink());
    drawChartBox(splitX + 8, c.y + headerH - 6, c.x + c.w - (splitX + 8) - pad, 90, data);

    drawLeft(c.x + pad, priceBase, priceTxt, FONT_B18, Theme::ink());
    char footer[56] = {0};
    snprintf(footer, sizeof(footer), "Prev close %s", prevCloseTxt);
    drawLeft(c.x + pad, deltaBase, footer, FONT_B9, Theme::ink());
    return;
  }

  // XL
  const int splitX = c.x + c.w / 2;
  d.drawFastVLine(splitX, c.y + headerH - 8, 92, Theme::ink());
  char l1[40] = {0}, l2[40] = {0}, l3[40] = {0};
  char r1[40] = {0}, r2[40] = {0}, r3[40] = {0};
  snprintf(l1, sizeof(l1), "Open  %s", openTxt);
  snprintf(l2, sizeof(l2), "High  %s", highTxt);
  snprintf(l3, sizeof(l3), "Low   %s", lowTxt);
  snprintf(r1, sizeof(r1), "Prev  %s", prevCloseTxt);
  snprintf(r2, sizeof(r2), "Range %s", data.chartRange[0] ? data.chartRange : "--");
  snprintf(r3, sizeof(r3), "%s", data.currency[0] ? data.currency : "--");
  drawLeft(c.x + pad, c.y + 38, l1, FONT_B12, Theme::ink());
  drawLeft(c.x + pad, c.y + 60, l2, FONT_B12, Theme::ink());
  drawLeft(c.x + pad, c.y + 82, l3, FONT_B12, Theme::ink());
  drawLeft(splitX + 14, c.y + 38, r1, FONT_B12, Theme::ink());
  drawLeft(splitX + 14, c.y + 60, r2, FONT_B12, Theme::ink());
  drawLeft(splitX + 14, c.y + 82, r3, FONT_B12, Theme::ink());

  drawLeft(c.x + pad, priceBase, priceTxt, FONT_B18, Theme::ink());
  drawChartBox(c.x + pad, c.y + headerH + 102, c.w - pad * 2, c.h - (headerH + 102) - 14, data);
  char footer[56] = {0};
  snprintf(footer, sizeof(footer), "%s  (%s)", changeTxt, pctTxt);
  drawLeft(c.x + pad, deltaBase, footer, FONT_B9, Theme::ink());
}

void setConfig(const FrameConfig* cfg) {
  g_cfg = cfg;
  applyConfigFromFrameConfig();
}

void render(const Cell& c, const String& moduleName) {
  if (!ensureState()) {
    drawCenteredLine(c.x, c.y, c.w, c.h, "Stock unavailable", FONT_B12, Theme::ink());
    return;
  }

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
