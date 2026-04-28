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
  float purchasePrice = NAN;
  float personalChangePercent = NAN;
  float selectedRangePercent = NAN;

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

// Purchase-aware UI is intentionally gated until purchase fields are finalized
// in the backend/config contract. Keep fallback layouts active by default.
static bool hasPurchaseData(const StockCache& data) {
  (void)data;
  return false;
}

static void drawChartBox(int x, int y, int w, int h, const StockCache& data) {
  if (w <= 6 || h <= 6 || data.seriesCount < 2) {
    drawCenteredLine(x, y, w, h, "No chart data", FONT_B9, Theme::ink());
    return;
  }

  const int innerX = x;
  const int innerY = y;
  const int innerW = w;
  const int innerH = h;

  float mn = data.series[0];
  float mx = data.series[0];
  for (uint8_t i = 1; i < data.seriesCount; i++) {
    if (data.series[i] < mn) mn = data.series[i];
    if (data.series[i] > mx) mx = data.series[i];
  }
  float span = mx - mn;
  if (span < 0.0001f) span = 1.0f;
  auto& d = DisplayCore::get();

  const int n = (int)data.seriesCount;
  int prevX = innerX;
  int prevY = innerY + innerH - (int)roundf(((data.series[0] - mn) / span) * (float)(innerH - 1));
  for (int i = 1; i < n; i++) {
    int px = innerX + (i * (innerW - 1)) / (n - 1);
    int py = innerY + innerH - (int)roundf(((data.series[i] - mn) / span) * (float)(innerH - 1));
    d.drawLine(prevX, prevY, px, py, Theme::ink());
    d.drawLine(prevX, prevY + 1, px, py + 1, Theme::ink());
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
  out.purchasePrice = doc["purchasePrice"] | NAN;
  out.personalChangePercent = doc["personalChangePercent"] | NAN;

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

  out.selectedRangePercent = NAN;
  if (out.seriesCount >= 2) {
    const float start = out.series[0];
    const float end = out.series[out.seriesCount - 1];
    if (isfinite(start) && isfinite(end) && fabsf(start) > 0.00001f) {
      out.selectedRangePercent = ((end - start) / start) * 100.0f;
    }
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
  auto& d = DisplayCore::get();
  const char* title = data.name[0] ? data.name : data.symbol;
  const bool hasPurchase = hasPurchaseData(data);

  char priceTxt[24] = {0};
  char changeTxt[20] = {0};
  char dayPctTxt[20] = {0};
  char rangePctTxt[20] = {0};
  char posPctTxt[20] = {0};

  formatPrice(priceTxt, sizeof(priceTxt), data.price);
  formatSigned(changeTxt, sizeof(changeTxt), data.change, 2, false);
  formatSigned(dayPctTxt, sizeof(dayPctTxt), data.changePercent, 2, true);
  formatSigned(rangePctTxt, sizeof(rangePctTxt), data.selectedRangePercent, 2, true);
  if (hasPurchase && isfinite(data.personalChangePercent)) {
    formatSigned(posPctTxt, sizeof(posPctTxt), data.personalChangePercent, 2, true);
  } else {
    strlcpy(posPctTxt, "--", sizeof(posPctTxt));
  }

  if (c.size == CELL_SMALL) {
    const uint16_t ink = Theme::ink();
    const int topPad = 20;
    const int underlineGap = 1;
    const int underlineH = 2;

    char titleFit[64] = {0};
    fitTextToWidth(title, titleFit, sizeof(titleFit), c.w - 16, FONT_B12);

    int16_t hx1, hy1;
    uint16_t hw, hh;
    measureText(titleFit, FONT_B12, hx1, hy1, hw, hh);

    const int titleBaseline = c.y + topPad - hy1;
    d.setFont(FONT_B12);
    d.setTextColor(ink);
    d.setTextSize(1);
    d.setCursor(c.x + c.w / 2 - (int)hw / 2 - hx1, titleBaseline);
    d.print(titleFit);
    d.setFont(nullptr);

    const int underlineY = titleBaseline + hy1 + (int)hh + underlineGap;
    const int underlineX = c.x + c.w / 2 - (int)hw / 2;
    d.fillRect(underlineX, underlineY, (int)hw, underlineH, ink);

    const int contentTop = underlineY + underlineH + 10;
    const int contentBottom = c.y + c.h - 10;
    const int contentH = contentBottom - contentTop;
    if (contentH <= 8) return;

    const int dividerInsetTop = 8;
    const int dividerInsetBottom = 8;
    const int dividerY = contentTop + dividerInsetTop;
    const int dividerH = max(8, contentH - dividerInsetTop - dividerInsetBottom);
    const int div1X = c.x + c.w / 3;
    const int div2X = c.x + (c.w * 2) / 3;
    d.drawFastVLine(div1X, dividerY, dividerH, ink);
    d.drawFastVLine(div2X, dividerY, dividerH, ink);

    const char* thirdValue = hasPurchase ? posPctTxt : rangePctTxt;
    drawCenteredLine(c.x + (c.w * 0) / 3, contentTop, c.w / 3, contentH, priceTxt, FONT_B12, ink);
    drawCenteredLine(c.x + (c.w * 1) / 3, contentTop, c.w / 3, contentH, dayPctTxt, FONT_B12, ink);
    drawCenteredLine(c.x + (c.w * 2) / 3, contentTop, c.w - ((c.w * 2) / 3), contentH, thirdValue, FONT_B12, ink);
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

  if (c.size == CELL_MEDIUM) {
    const int sidePad = 12;
    const int rightSafePad = 16;
    const int headerY = c.y + 20;
    const int chartX = c.x + sidePad + 2;
    const int chartY = c.y + 42;
    const int chartW = c.w - (sidePad + 2) * 2;
    const int chartH = 26;
    const int priceY = c.y + c.h - 16;

    char titleFit[64] = {0};
    fitTextToWidth(title, titleFit, sizeof(titleFit), c.w - (sidePad + rightSafePad) - 120, FONT_B12);
    drawLeft(c.x + sidePad, headerY, titleFit, FONT_B12, Theme::ink());

    char rightTxt[40] = {0};
    snprintf(rightTxt, sizeof(rightTxt), "%s  %s", changeTxt, dayPctTxt);
    int rw = textWidth(rightTxt, FONT_B12);
    drawLeft(c.x + c.w - rightSafePad - rw, headerY, rightTxt, FONT_B12, Theme::ink());

    drawChartBox(chartX, chartY, chartW, chartH, data);
    drawLeft(c.x + sidePad, priceY, priceTxt, FONT_B18, Theme::ink());
    return;
  }

  if (c.size == CELL_LARGE) {
    const int pad = 12;
    const int leftW = (c.w * 56) / 100;
    const int rightX = c.x + leftW;
    const int rightW = c.w - leftW;

    char titleFit[64] = {0};
    fitTextToWidth(title, titleFit, sizeof(titleFit), leftW - pad * 2, FONT_B12);
    drawLeft(c.x + pad, c.y + 18, titleFit, FONT_B12, Theme::ink());

    const int labelX = c.x + pad;
    const int valueX = c.x + pad + 58;
    const int rowY0 = c.y + 42;
    const int rowStep = 16;
    if (hasPurchase) {
      char avgBuyTxt[24] = {0};
      formatPrice(avgBuyTxt, sizeof(avgBuyTxt), data.purchasePrice);
      drawLeft(labelX, rowY0 + rowStep * 0, "Avg buy", FONT_B9, Theme::ink());
      drawLeft(valueX, rowY0 + rowStep * 0, avgBuyTxt, FONT_B9, Theme::ink());
      drawLeft(labelX, rowY0 + rowStep * 1, "Position", FONT_B9, Theme::ink());
      drawLeft(valueX, rowY0 + rowStep * 1, posPctTxt, FONT_B9, Theme::ink());
      drawLeft(labelX, rowY0 + rowStep * 2, "Gain", FONT_B9, Theme::ink());
      drawLeft(valueX, rowY0 + rowStep * 2, changeTxt, FONT_B9, Theme::ink());
    } else {
      drawLeft(labelX, rowY0 + rowStep * 0, "Open", FONT_B9, Theme::ink());
      drawLeft(valueX, rowY0 + rowStep * 0, openTxt, FONT_B9, Theme::ink());
      drawLeft(labelX, rowY0 + rowStep * 1, "High", FONT_B9, Theme::ink());
      drawLeft(valueX, rowY0 + rowStep * 1, highTxt, FONT_B9, Theme::ink());
      drawLeft(labelX, rowY0 + rowStep * 2, "Low", FONT_B9, Theme::ink());
      drawLeft(valueX, rowY0 + rowStep * 2, lowTxt, FONT_B9, Theme::ink());
    }

    drawLeft(c.x + pad, c.y + c.h - 18, priceTxt, FONT_B18, Theme::ink());

    char rightTop[40] = {0};
    snprintf(rightTop, sizeof(rightTop), "%s  %s", changeTxt, dayPctTxt);
    int rtw = textWidth(rightTop, FONT_B12);
    drawLeft(rightX + rightW - pad - rtw, c.y + 18, rightTop, FONT_B12, Theme::ink());
    drawChartBox(rightX + pad, c.y + 34, rightW - pad * 2, c.h - 48, data);
    return;
  }

  // XL
  const int pad = 14;
  const int topH = c.h / 2;
  const int leftX = c.x + pad;
  const int rightX = c.x + c.w / 2 + 8;
  const int rowY = c.y + 34;
  const int rowStep = 22;

  char titleFit[64] = {0};
  fitTextToWidth(title, titleFit, sizeof(titleFit), c.w - pad * 2, FONT_B12);
  drawLeft(leftX, c.y + 16, titleFit, FONT_B12, Theme::ink());

  if (hasPurchase) {
    char avgBuyTxt[24] = {0};
    formatPrice(avgBuyTxt, sizeof(avgBuyTxt), data.purchasePrice);
    drawLeft(leftX, rowY + rowStep * 0, "Avg buy", FONT_B12, Theme::ink());
    drawLeft(leftX + 88, rowY + rowStep * 0, avgBuyTxt, FONT_B12, Theme::ink());
    drawLeft(leftX, rowY + rowStep * 1, "Position", FONT_B12, Theme::ink());
    drawLeft(leftX + 88, rowY + rowStep * 1, posPctTxt, FONT_B12, Theme::ink());
    drawLeft(leftX, rowY + rowStep * 2, "Gain", FONT_B12, Theme::ink());
    drawLeft(leftX + 88, rowY + rowStep * 2, changeTxt, FONT_B12, Theme::ink());

    drawLeft(rightX, rowY + rowStep * 0, "Day %", FONT_B12, Theme::ink());
    drawLeft(rightX + 80, rowY + rowStep * 0, dayPctTxt, FONT_B12, Theme::ink());
    drawLeft(rightX, rowY + rowStep * 1, "Range", FONT_B12, Theme::ink());
    drawLeft(rightX + 80, rowY + rowStep * 1, data.chartRange[0] ? data.chartRange : "--", FONT_B12, Theme::ink());
    drawLeft(rightX, rowY + rowStep * 2, "Currency", FONT_B12, Theme::ink());
    drawLeft(rightX + 80, rowY + rowStep * 2, data.currency[0] ? data.currency : "--", FONT_B12, Theme::ink());
  } else {
    drawLeft(leftX, rowY + rowStep * 0, "Open", FONT_B12, Theme::ink());
    drawLeft(leftX + 88, rowY + rowStep * 0, openTxt, FONT_B12, Theme::ink());
    drawLeft(leftX, rowY + rowStep * 1, "High", FONT_B12, Theme::ink());
    drawLeft(leftX + 88, rowY + rowStep * 1, highTxt, FONT_B12, Theme::ink());
    drawLeft(leftX, rowY + rowStep * 2, "Low", FONT_B12, Theme::ink());
    drawLeft(leftX + 88, rowY + rowStep * 2, lowTxt, FONT_B12, Theme::ink());

    drawLeft(rightX, rowY + rowStep * 0, "Prev close", FONT_B12, Theme::ink());
    drawLeft(rightX + 80, rowY + rowStep * 0, prevCloseTxt, FONT_B12, Theme::ink());
    drawLeft(rightX, rowY + rowStep * 1, "Change", FONT_B12, Theme::ink());
    drawLeft(rightX + 80, rowY + rowStep * 1, changeTxt, FONT_B12, Theme::ink());
    drawLeft(rightX, rowY + rowStep * 2, "Day %", FONT_B12, Theme::ink());
    drawLeft(rightX + 80, rowY + rowStep * 2, dayPctTxt, FONT_B12, Theme::ink());
  }

  drawLeft(leftX, c.y + topH - 14, priceTxt, FONT_B18, Theme::ink());
  drawChartBox(c.x + pad, c.y + topH + 8, c.w - pad * 2, c.h - topH - 16, data);
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
