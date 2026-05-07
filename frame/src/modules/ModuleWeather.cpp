// ModuleWeather.cpp
#include "ModuleWeather.h"
#include "DisplayCore.h"
#include "Theme.h"
#include "NetClient.h"
#include "ModuleIcons.h"
#include "Config.h"

#include <ArduinoJson.h>
#include <math.h>
#include <string.h>
#include <time.h>

// -----------------------------------------------------------------------------
// Fonts (Norwegian fonts)
// -----------------------------------------------------------------------------
#include "Fonts/FreeSans9ptNO.h"
#include "Fonts/FreeSansBold12ptNO.h"
#include "Fonts/FreeSansBold18ptNO.h"

#define FONT_B9  (&FreeSans9pt8b)
#define FONT_B12 (&FreeSansBold12pt8b)
#define FONT_B18 (&FreeSansBold18pt8b)

// -----------------------------------------------------------------------------
// Local config/cache
// -----------------------------------------------------------------------------
struct WeatherInstanceConfig {
  uint8_t id = 1;
  float lat = 59.9139f;   // Oslo default
  float lon = 10.7522f;
  char label[40] = "Oslo";
  char units[8] = "metric";
  uint32_t refreshMs = 600000UL; // 10 min
  bool showHiLo = true;
  bool showCondition = true;
};

struct DayForecast {
  bool  valid = false;
  float hiC = NAN;
  float loC = NAN;
  float windMaxMs = NAN;
  float precipMm  = NAN;
  int   wmo = -1;
  char  dateYMD[11] = {0};
};

struct WeatherCache {
  bool valid = false;
  uint32_t fetchedAtMs = 0;

  float tempC = NAN;
  float humidity = NAN;
  int currentWmo = -1;

  float hiC = NAN;
  float loC = NAN;
  float windMaxMs = NAN;
  float precipMm  = NAN;
  int   wmo = -1;

  // Rest of current day
  bool  restValid = false;
  float restHiC = NAN;
  float restLoC = NAN;
  float restWindMaxMs = NAN;
  float restPrecipMm  = NAN;
  int   restWmo = -1;

  char condition[28] = {0};

  char sunriseHHMM[6] = {0};
  char sunsetHHMM[6]  = {0};

  static const int MAX_DAYS = 5;
  int dayCount = 0;
  DayForecast days[MAX_DAYS];
};

static const int MAX_INSTANCES = 4;

static const FrameConfig* g_cfg = nullptr;
static WeatherInstanceConfig g_inst[MAX_INSTANCES];
static WeatherCache g_cache[MAX_INSTANCES];

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
static uint8_t parseInstanceId(const String& moduleName) {
  int idx = moduleName.indexOf(':');
  if (idx < 0) return 1;
  int id = moduleName.substring(idx + 1).toInt();
  if (id < 1) id = 1;
  if (id > 255) id = 255;
  return (uint8_t)id;
}

static int instIndex(uint8_t id) {
  if (id < 1) id = 1;
  if (id > MAX_INSTANCES) id = MAX_INSTANCES;
  return (int)id - 1;
}

static const char* conditionFromWmo(int code) {
  switch (code) {
    case 0:  return "Clear";
    case 1:  return "Mostly clear";
    case 2:  return "Partly cloudy";
    case 3:  return "Overcast";
    case 45:
    case 48: return "Fog";
    case 51:
    case 53:
    case 55: return "Drizzle";
    case 56:
    case 57: return "Freezing drizzle";
    case 61:
    case 63:
    case 65: return "Rain";
    case 66:
    case 67: return "Freezing rain";
    case 71:
    case 73:
    case 75: return "Snow";
    case 77: return "Snow grains";
    case 80:
    case 81:
    case 82: return "Showers";
    case 85:
    case 86: return "Snow showers";
    case 95: return "Thunder";
    case 96:
    case 99: return "Thunder + hail";
    default: return "Unknown";
  }
}

static bool isSnowWmo(int code) {
  switch (code) {
    case 71:
    case 73:
    case 75:
    case 77:
    case 85:
    case 86:
      return true;
    default:
      return false;
  }
}

static bool isPrecipWmo(int code) {
  if (isSnowWmo(code)) return true;
  if (code == 66 || code == 67) return true;
  if ((code >= 51 && code <= 65)) return true;
  if (code >= 80 && code <= 82) return true;
  if (code == 95 || code == 96 || code == 99) return true;
  return false;
}

static bool isLiquidPrecipWmo(int code) {
  if (code == 66 || code == 67) return true;
  if ((code >= 51 && code <= 65)) return true;
  if (code >= 80 && code <= 82) return true;
  if (code == 95 || code == 96 || code == 99) return true;
  return false;
}

static bool isDrizzleLikeWmo(int code) {
  return (code >= 51 && code <= 55);
}

static bool isShowersLikeWmo(int code) {
  return (code >= 80 && code <= 82);
}

static void utf8ToLatin1(char* out, size_t n, const char* in) {
  if (!out || n == 0) return;
  size_t oi = 0;

  for (size_t i = 0; in && in[i] && oi + 1 < n; i++) {
    uint8_t c = (uint8_t)in[i];

    if (c < 0x80) { out[oi++] = (char)c; continue; }

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

static void getDisplayLocationName(const WeatherInstanceConfig& cfg, char* out, size_t n) {
  if (!out || n == 0) return;
  out[0] = 0;

  if (cfg.label[0]) {
    size_t oi = 0;
    for (size_t i = 0; cfg.label[i] && oi + 1 < n; i++) {
      char c = cfg.label[i];
      if (c == '_') c = ' ';
      out[oi++] = c;
    }
    out[oi] = 0;
    return;
  }

  strlcpy(out, "--", n);
}

static void formatTemp(char* out, size_t n, float c, const char* units) {
  if (!out || n == 0) return;
  if (isnan(c)) { strlcpy(out, "--", n); return; }

  float v = c;
  const char* suf = "C";
  if (units && strcmp(units, "imperial") == 0) {
    v = (c * 9.0f / 5.0f) + 32.0f;
    suf = "F";
  }
  int t = (int)lroundf(v);
  snprintf(out, n, "%d\xB0%s", t, suf);
}

static void measureText(const char* text, const GFXfont* font,
                        int16_t& x1, int16_t& y1, uint16_t& w, uint16_t& h) {
  auto& d = DisplayCore::get();
  d.setFont(font);
  d.setTextSize(1);
  d.getTextBounds(text, 0, 0, &x1, &y1, &w, &h);
}

static void fontBoxMetrics(const GFXfont* font, int16_t& y1, uint16_t& h) {
  int16_t x1, _y1; uint16_t w, _h;
  measureText("Ag", font, x1, _y1, w, _h);
  y1 = _y1;
  h  = _h;
}

static void drawCenteredBox(int x, int y, int w, int h,
                            const char* text, const GFXfont* font, uint16_t col) {
  auto& d = DisplayCore::get();
  int16_t x1, y1; uint16_t tw, th;
  measureText(text, font, x1, y1, tw, th);

  int cx = x + (w - (int)tw)/2 - x1;
  int cy = y + (h - (int)th)/2 - y1;

  d.setFont(font);
  d.setTextColor(col);
  d.setCursor(cx, cy);
  d.print(text);
  d.setFont(nullptr);
}

static void drawTextCenteredAt(int cx, int baselineY,
                               const char* txt, const GFXfont* font, uint16_t ink) {
  auto& d = DisplayCore::get();
  int16_t x1, y1; uint16_t tw, th;
  measureText(txt, font, x1, y1, tw, th);
  d.setFont(font);
  d.setTextColor(ink);
  d.setCursor(cx - (int)tw / 2 - x1, baselineY);
  d.print(txt);
  d.setFont(nullptr);
}

static void drawLeft(int x, int baselineY, const char* text, const GFXfont* font, uint16_t col) {
  auto& d = DisplayCore::get();
  d.setFont(font);
  d.setTextColor(col);
  d.setCursor(x, baselineY);
  d.print(text);
  d.setFont(nullptr);
}

static void drawDividerAtX(int x, int baselineY, const GFXfont* font, uint16_t col) {
  auto& d = DisplayCore::get();

  int16_t y1; uint16_t h;
  fontBoxMetrics(font, y1, h);

  int boxTop = baselineY + (int)y1;
  int boxBot = boxTop + (int)h;
  int mid    = (boxTop + boxBot) / 2;

  int desiredH = (int)lroundf((float)h * 1.55f);
  if (desiredH < 14) desiredH = 14;

  int yTop = mid - desiredH / 2;
  d.drawFastVLine(x, yTop, desiredH, col);
}

static void drawDividerAtXShort(int x, int baselineY, const GFXfont* font, uint16_t col) {
  auto& d = DisplayCore::get();

  int16_t y1; uint16_t h;
  fontBoxMetrics(font, y1, h);

  int boxTop = baselineY + (int)y1;
  int boxBot = boxTop + (int)h;
  int mid    = (boxTop + boxBot) / 2;

  int desiredH = (int)lroundf((float)h * 1.05f);
  if (desiredH < 10) desiredH = 10;

  int yTop = mid - desiredH / 2;
  d.drawFastVLine(x, yTop, desiredH, col);
}

static void drawSunRangeLine(int x, int y, int w, int h,
                             const char* sunriseHHMM,
                             const char* sunsetHHMM,
                             uint16_t col,
                             const GFXfont* font = FONT_B12) {
  auto& d = DisplayCore::get();

  char leftTxt[18] = {0};
  char rightTxt[8] = {0};
  snprintf(leftTxt, sizeof(leftTxt), "Sun %s", (sunriseHHMM && sunriseHHMM[0]) ? sunriseHHMM : "--:--");
  strlcpy(rightTxt, (sunsetHHMM && sunsetHHMM[0]) ? sunsetHHMM : "--:--", sizeof(rightTxt));

  int16_t x1, y1;
  uint16_t wL, hL, wR, hR;
  measureText(leftTxt,  font, x1, y1, wL, hL);
  measureText(rightTxt, font, x1, y1, wR, hR);

  int16_t fy1; uint16_t fh;
  fontBoxMetrics(font, fy1, fh);
  int baselineY = y + (h - (int)fh)/2 - (int)fy1;

  const int gap = 8;
  const int dividerW = 1;
  int totalW = (int)wL + gap + dividerW + gap + (int)wR;

  int startX = x + (w - totalW)/2;

  int cx = startX;
  drawLeft(cx, baselineY, leftTxt, font, col);
  cx += (int)wL + gap;

  drawDividerAtXShort(cx, baselineY, font, col);
  cx += dividerW + gap;

  drawLeft(cx, baselineY, rightTxt, font, col);

  d.setFont(nullptr);
}

// -----------------------------------------------------------------------------
// Wrapped text helpers
// -----------------------------------------------------------------------------
static int wrapTextToLines(const char* text,
                           const GFXfont* font,
                           int maxWidth,
                           char lines[][64],
                           int maxLines) {
  if (!text || !lines || maxLines <= 0) return 0;

  lines[0][0] = 0;
  int lineCount = 0;

  char buf[192];
  strlcpy(buf, text, sizeof(buf));

  char* saveptr = nullptr;
  char* word = strtok_r(buf, " ", &saveptr);

  while (word) {
    if (lineCount >= maxLines) break;

    char candidate[64] = {0};

    if (lines[lineCount][0] == 0) strlcpy(candidate, word, sizeof(candidate));
    else snprintf(candidate, sizeof(candidate), "%s %s", lines[lineCount], word);

    int16_t x1, y1; uint16_t tw, th;
    measureText(candidate, font, x1, y1, tw, th);

    if ((int)tw <= maxWidth || lines[lineCount][0] == 0) {
      strlcpy(lines[lineCount], candidate, sizeof(lines[lineCount]));
    } else {
      lineCount++;
      if (lineCount >= maxLines) break;
      strlcpy(lines[lineCount], word, sizeof(lines[lineCount]));
    }

    word = strtok_r(nullptr, " ", &saveptr);
  }

  if (lines[0][0] == 0) return 0;
  return lineCount + 1;
}

static int wrapTextTwoLinesEllipsized(const char* text,
                                      const GFXfont* font,
                                      int maxWidth,
                                      char line1[64],
                                      char line2[64]) {
  if (!line1 || !line2) return 0;
  line1[0] = 0;
  line2[0] = 0;
  if (!text || !text[0]) return 0;

  char buf[192];
  strlcpy(buf, text, sizeof(buf));

  const int MAX_WORDS = 32;
  char* words[MAX_WORDS];
  int wordCount = 0;

  char* saveptr = nullptr;
  char* w = strtok_r(buf, " ", &saveptr);
  while (w && wordCount < MAX_WORDS) {
    words[wordCount++] = w;
    w = strtok_r(nullptr, " ", &saveptr);
  }

  if (wordCount == 0) return 0;
  if (wordCount == 1) {
    strlcpy(line1, words[0], 64);
    return 1;
  }

  int bestSplit = 1;
  int bestDiff = 99999;

  for (int split = 1; split < wordCount; split++) {
    char l1[64] = {0};
    char l2[64] = {0};

    for (int i = 0; i < split; i++) {
      if (i > 0) strlcat(l1, " ", sizeof(l1));
      strlcat(l1, words[i], sizeof(l1));
    }

    for (int i = split; i < wordCount; i++) {
      if (i > split) strlcat(l2, " ", sizeof(l2));
      strlcat(l2, words[i], sizeof(l2));
    }

    int16_t x1, y1;
    uint16_t w1, h1, w2, h2;
    measureText(l1, font, x1, y1, w1, h1);
    measureText(l2, font, x1, y1, w2, h2);

    if ((int)w1 > maxWidth || (int)w2 > maxWidth) continue;

    int diff = abs((int)w1 - (int)w2);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestSplit = split;
    }
  }

  line1[0] = 0;
  line2[0] = 0;

  for (int i = 0; i < bestSplit; i++) {
    if (i > 0) strlcat(line1, " ", 64);
    strlcat(line1, words[i], 64);
  }

  for (int i = bestSplit; i < wordCount; i++) {
    if (i > bestSplit) strlcat(line2, " ", 64);
    strlcat(line2, words[i], 64);
  }

  const char* ell = "...";

  auto fitWithEllipsis = [&](char* line) {
    int16_t x1, y1; uint16_t tw, th;

    while (true) {
      char candidate[64];
      snprintf(candidate, sizeof(candidate), "%s%s", line, ell);

      measureText(candidate, font, x1, y1, tw, th);
      if ((int)tw <= maxWidth || strlen(line) == 0) {
        strlcpy(line, candidate, 64);
        break;
      }

      size_t len = strlen(line);
      if (len == 0) break;
      line[len - 1] = 0;
      while (strlen(line) > 0 && line[strlen(line) - 1] == ' ') {
        line[strlen(line) - 1] = 0;
      }
    }
  };

  char tmpLines[6][64] = {{0}};
  int originalCount = wrapTextToLines(text, font, maxWidth, tmpLines, 6);

  if (originalCount > 2) {
    fitWithEllipsis(line2);
  }

  return (line2[0] ? 2 : 1);
}

static void drawWrappedTextBox(int x, int y, int w, int h,
                               const char* text,
                               const GFXfont* font,
                               uint16_t col,
                               int padX) {
  if (!text || !text[0]) return;

  int maxWidth = w - padX * 2;
  if (maxWidth < 10) return;

  char line1[64] = {0};
  char line2[64] = {0};

  int lineCount = wrapTextTwoLinesEllipsized(text, font, maxWidth, line1, line2);
  if (lineCount <= 0) return;

  int16_t fy1; uint16_t fh;
  fontBoxMetrics(font, fy1, fh);

  const int lineGap = 3;
  int totalH = (lineCount == 2) ? ((int)fh * 2 + lineGap) : (int)fh;
  int firstTop = y + (h - totalH) / 2;

  auto& d = DisplayCore::get();
  d.setFont(font);
  d.setTextColor(col);

  {
    int lineTop = firstTop;
    int baselineY = lineTop - fy1;

    int16_t x1, y1; uint16_t tw, th;
    measureText(line1, font, x1, y1, tw, th);
    int drawX = x + padX + (maxWidth - (int)tw) / 2 - x1;

    d.setCursor(drawX, baselineY);
    d.print(line1);
  }

  if (lineCount > 1) {
    int lineTop = firstTop + (int)fh + lineGap;
    int baselineY = lineTop - fy1;

    int16_t x1, y1; uint16_t tw, th;
    measureText(line2, font, x1, y1, tw, th);
    int drawX = x + padX + (maxWidth - (int)tw) / 2 - x1;

    d.setCursor(drawX, baselineY);
    d.print(line2);
  }

  d.setFont(nullptr);
}

static void drawWeatherIconWithTwoLineTextBlockCentered(int x, int y, int w, int h,
                                                        int wmo,
                                                        const char* text,
                                                        uint16_t ink) {
  if (w <= 0 || h <= 0) return;

  const int textGap = 10;
  const int padX = 4;

  int16_t textY1; uint16_t textH;
  fontBoxMetrics(FONT_B9, textY1, textH);

  int maxTextW = w - 60;
  if (maxTextW < 30) maxTextW = 30;

  char line1[64] = {0};
  char line2[64] = {0};
  int lineCount = wrapTextTwoLinesEllipsized(text, FONT_B9, maxTextW, line1, line2);
  if (lineCount <= 0) {
    strlcpy(line1, "--", sizeof(line1));
    lineCount = 1;
  }

  int16_t l1x1, l1y1, l2x1, l2y1;
  uint16_t l1w, l1h, l2w, l2h;
  measureText(line1, FONT_B9, l1x1, l1y1, l1w, l1h);
  if (lineCount > 1) measureText(line2, FONT_B9, l2x1, l2y1, l2w, l2h);
  else { l2w = 0; l2h = 0; }

  int textBlockW = (int)((l1w > l2w) ? l1w : l2w);
  int textBlockH = (lineCount == 2) ? ((int)textH * 2 + 3) : (int)textH;

  int iconSize = h - 6;
  if (iconSize < 26) iconSize = 26;

  int totalW = iconSize + textGap + textBlockW;
  if (totalW > w - padX * 2) {
    iconSize = (w - padX * 2) - textGap - textBlockW;
    if (iconSize < 22) iconSize = 22;
    totalW = iconSize + textGap + textBlockW;
  }

  if (iconSize > h) iconSize = h;
  int totalH = (iconSize > textBlockH) ? iconSize : textBlockH;

  int blockX = x + (w - totalW) / 2;
  int blockY = y + (h - totalH) / 2;

  int iconCx = blockX + iconSize / 2;
  int iconCy = blockY + totalH / 2;

  ModuleIcons::drawWeatherIcon(iconCx, iconCy, iconSize, wmo);

  int textX = blockX + iconSize + textGap;
  int textTop = blockY + (totalH - textBlockH) / 2;

  auto& d = DisplayCore::get();
  d.setFont(FONT_B9);
  d.setTextColor(ink);

  int line1Baseline = textTop - textY1;
  d.setCursor(textX - l1x1, line1Baseline);
  d.print(line1);

  if (lineCount > 1) {
    int line2Top = textTop + (int)textH + 3;
    int line2Baseline = line2Top - textY1;
    d.setCursor(textX - l2x1, line2Baseline);
    d.print(line2);
  }

  d.setFont(nullptr);
}

// -----------------------------------------------------------------------------
// Date/time parsing + weekday name
// -----------------------------------------------------------------------------
static bool parseHourFromIso8601(const char* iso, int& outHour) {
  if (!iso) return false;
  const char* t = strchr(iso, 'T');
  if (!t || !t[1] || !t[2]) return false;
  if (t[1] < '0' || t[1] > '9' || t[2] < '0' || t[2] > '9') return false;
  outHour = (t[1] - '0') * 10 + (t[2] - '0');
  return true;
}

static bool parseYMDFromIso8601(const char* iso, int& y, int& m, int& d) {
  if (!iso) return false;
  if (strlen(iso) < 10) return false;
  if (iso[4] != '-' || iso[7] != '-') return false;
  for (int i = 0; i < 10; i++) {
    if (i == 4 || i == 7) continue;
    if (iso[i] < '0' || iso[i] > '9') return false;
  }
  y = (iso[0]-'0')*1000 + (iso[1]-'0')*100 + (iso[2]-'0')*10 + (iso[3]-'0');
  m = (iso[5]-'0')*10 + (iso[6]-'0');
  d = (iso[8]-'0')*10 + (iso[9]-'0');
  return true;
}

static void copyYMD10(char out[11], const char* iso) {
  if (!out) return;
  out[0] = 0;
  if (!iso || strlen(iso) < 10) return;
  memcpy(out, iso, 10);
  out[10] = 0;
}

static void extractHHMM(char out[6], const char* iso) {
  if (!out) return;
  out[0] = 0;
  if (!iso) return;
  const char* t = strchr(iso, 'T');
  if (!t || strlen(t) < 6) return;
  out[0] = t[1];
  out[1] = t[2];
  out[2] = ':';
  out[3] = t[4];
  out[4] = t[5];
  out[5] = 0;
}

static int weekdayIndex(int y, int m, int d) {
  static int t[] = {0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4};
  if (m < 3) y -= 1;
  return (y + y/4 - y/100 + y/400 + t[m-1] + d) % 7;
}

static const char* weekdayNameShort(int idx) {
  switch (idx) {
    case 0: return "Sunday";
    case 1: return "Monday";
    case 2: return "Tuesday";
    case 3: return "Wednesday";
    case 4: return "Thursday";
    case 5: return "Friday";
    case 6: return "Saturday";
    default: return "";
  }
}

static int wmoSeverityRank(int wmo) {
  if (wmo == 95 || wmo == 96 || wmo == 99) return 90;
  if (isSnowWmo(wmo)) return 100;
  if (wmo == 66 || wmo == 67) return 85;
  if ((wmo >= 51 && wmo <= 65) || (wmo >= 80 && wmo <= 82)) return 80;
  if (wmo == 45 || wmo == 48) return 60;
  if (wmo == 3) return 40;
  if (wmo == 1 || wmo == 2) return 30;
  if (wmo == 0) return 10;
  return 20;
}

// -----------------------------------------------------------------------------
// Impact / display logic
// -----------------------------------------------------------------------------
static const float PRECIP_MEANINGFUL_MM = 2.0f;
static const float PRECIP_LIGHT_MM      = 0.2f;
static const float PRECIP_MODERATE_MM   = 4.0f;
static const float PRECIP_HEAVY_MM      = 6.0f;

static int roundMmToInt(float mm) {
  if (isnan(mm)) return 0;
  int v = (int)floorf(mm + 0.5f);
  if (v < 0) v = 0;
  return v;
}

static bool shouldLabelSnowByTemp(float loC, float hiC) {
  if (isnan(loC) || isnan(hiC)) return false;
  return (hiC <= 0.0f);
}

static int normalizeDisplayWmoForTemps(int wmo, float loC, float hiC) {
  if (!isSnowWmo(wmo)) return wmo;
  if (isnan(loC) || isnan(hiC)) return wmo;

  // Prevent clearly above-freezing days from being presented as snow.
  // This keeps mixed hourly data from turning an otherwise rainy/mild day
  // into a snow icon + "Snow: xxmm" on the frame.
  if (loC >= 1.0f || hiC >= 3.0f) {
    return 63; // Rain
  }

  return wmo;
}

static int hhmmToMinutes(const char* hhmm) {
  if (!hhmm || strlen(hhmm) < 5) return -1;
  if (hhmm[0] < '0' || hhmm[0] > '9') return -1;
  if (hhmm[1] < '0' || hhmm[1] > '9') return -1;
  if (hhmm[2] != ':') return -1;
  if (hhmm[3] < '0' || hhmm[3] > '9') return -1;
  if (hhmm[4] < '0' || hhmm[4] > '9') return -1;

  int hh = (hhmm[0] - '0') * 10 + (hhmm[1] - '0');
  int mm = (hhmm[3] - '0') * 10 + (hhmm[4] - '0');

  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return -1;
  return hh * 60 + mm;
}

static bool getLocalHourNow(int& outHour) {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo, 10)) return false;
  outHour = timeinfo.tm_hour;
  return true;
}

static int currentLocalMinutesNow() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo, 10)) return -1;
  return timeinfo.tm_hour * 60 + timeinfo.tm_min;
}

static bool isSunDownNow(const char* sunriseHHMM, const char* sunsetHHMM) {
  int sunriseMin = hhmmToMinutes(sunriseHHMM);
  int sunsetMin  = hhmmToMinutes(sunsetHHMM);
  int nowMin     = currentLocalMinutesNow();

  if (sunriseMin < 0 || sunsetMin < 0 || nowMin < 0) return false;
  return (nowMin < sunriseMin || nowMin >= sunsetMin);
}

static bool fillTodayRestForecast(const WeatherCache& data, DayForecast& out) {
  if (!data.restValid) return false;
  out = DayForecast();
  out.valid = true;
  out.hiC = data.restHiC;
  out.loC = data.restLoC;
  out.windMaxMs = data.restWindMaxMs;
  out.precipMm = data.restPrecipMm;
  out.wmo = data.restWmo;
  if (data.dayCount > 0 && data.days[0].dateYMD[0]) {
    strlcpy(out.dateYMD, data.days[0].dateYMD, sizeof(out.dateYMD));
  }
  return true;
}

static const char* clothingTimePhrase() {
  int hour = -1;
  if (!getLocalHourNow(hour)) return "today";

  if (hour >= 22 || hour < 4) return "tonight";
  if (hour >= 17) return "this evening";
  return "today";
}

static bool hasMeaningfulRainSignal(float precipMm, int wmo) {
  if (!isnan(precipMm) && precipMm > PRECIP_MEANINGFUL_MM) return true;
  if (isShowersLikeWmo(wmo) && !isnan(precipMm) && precipMm > PRECIP_LIGHT_MM) return true;
  if (isLiquidPrecipWmo(wmo) && !isnan(precipMm) && precipMm >= PRECIP_MODERATE_MM) return true;
  return false;
}

static bool hasLightRainSignal(float precipMm, int wmo) {
  if (!isnan(precipMm) && precipMm > PRECIP_LIGHT_MM) return true;
  if (isLiquidPrecipWmo(wmo)) return true;
  return false;
}

static void buildPrecipStr(char* out, size_t n,
                           float precipMm,
                           int wmoForLabel,
                           float loC, float hiC) {
  if (!out || n == 0) return;

  bool snowy = isSnowWmo(wmoForLabel);
  if (!snowy && shouldLabelSnowByTemp(loC, hiC)) snowy = true;

  if (snowy) {
    if (isnan(precipMm) || precipMm <= PRECIP_LIGHT_MM) {
      strlcpy(out, "Mostly dry", n);
      return;
    }

    int p = roundMmToInt(precipMm);
    if (p <= 0) strlcpy(out, "Mostly dry", n);
    else snprintf(out, n, "Snow: %dmm", p);
    return;
  }

  if (isnan(precipMm)) {
    strlcpy(out, "Mostly dry", n);
    return;
  }

  if (precipMm > PRECIP_MEANINGFUL_MM) {
    int p = roundMmToInt(precipMm);
    if (p <= 0) strlcpy(out, "Mostly dry", n);
    else snprintf(out, n, "Rain: %dmm", p);
    return;
  }

  if (precipMm > PRECIP_LIGHT_MM && isLiquidPrecipWmo(wmoForLabel)) {
    if (isDrizzleLikeWmo(wmoForLabel)) strlcpy(out, "Light drizzle", n);
    else if (isShowersLikeWmo(wmoForLabel)) strlcpy(out, "Light showers", n);
    else strlcpy(out, "Light rain later", n);
    return;
  }

  strlcpy(out, "Mostly dry", n);
}

// -----------------------------------------------------------------------------
// Clothing suggestion helper
// -----------------------------------------------------------------------------
static void buildClothingSuggestion(char* out, size_t n,
                                    float nowC,
                                    float hiC,
                                    float loC,
                                    float windMaxMs,
                                    float precipMm,
                                    int wmo,
                                    const char* sunriseHHMM,
                                    const char* sunsetHHMM) {
  if (!out || n == 0) return;
  out[0] = 0;

  float refTemp = NAN;

  if (!isnan(nowC)) {
    refTemp = nowC;
  } else if (!isnan(hiC) && !isnan(loC)) {
    refTemp = hiC * 0.60f + loC * 0.40f;
  } else if (!isnan(hiC)) {
    refTemp = hiC;
  } else if (!isnan(loC)) {
    refTemp = loC;
  }

  bool sunDown = isSunDownNow(sunriseHHMM, sunsetHHMM);

  if (!isnan(refTemp) && sunDown) {
    refTemp -= 2.0f;
  }

  const char* when = clothingTimePhrase();

  bool snowy        = isSnowWmo(wmo) || shouldLabelSnowByTemp(loC, hiC);
  bool lightRain    = hasLightRainSignal(precipMm, wmo);
  bool rainy        = hasMeaningfulRainSignal(precipMm, wmo);
  bool heavyRain    = (!isnan(precipMm) && precipMm >= PRECIP_HEAVY_MM);
  bool breezy       = (!isnan(windMaxMs) && windMaxMs >= 5.0f);
  bool windy        = (!isnan(windMaxMs) && windMaxMs >= 7.0f);
  bool veryWindy    = (!isnan(windMaxMs) && windMaxMs >= 10.0f);

  bool umbrellaFriendly = !breezy;
  bool freezing = (!isnan(refTemp) && refTemp <= 0.0f);
  bool cold     = (!isnan(refTemp) && refTemp <= 7.0f);
  bool cool     = (!isnan(refTemp) && refTemp <= 13.0f);
  bool mild     = (!isnan(refTemp) && refTemp <= 18.0f);
  bool warm     = (!isnan(refTemp) && refTemp <= 24.0f);

  bool needsJacketFromWind     = windy && refTemp <= 15.0f;
  bool needsWarmJacketFromWind = veryWindy && refTemp <= 10.0f;

  if (snowy || freezing) {
    if (veryWindy) snprintf(out, n, "A warm jacket and boots will feel best %s.", when);
    else           snprintf(out, n, "A warm jacket and boots are recommended %s.", when);
    return;
  }

  if (heavyRain) {
    if (umbrellaFriendly) snprintf(out, n, "A rain jacket and umbrella would be wise %s.", when);
    else                  snprintf(out, n, "A raincoat with a hood and good shoes would be wise %s.", when);
    return;
  }

  if (rainy) {
    if (!umbrellaFriendly) {
      if (cold || needsWarmJacketFromWind) snprintf(out, n, "A proper rain jacket will be the better choice %s.", when);
      else                                 snprintf(out, n, "A rain jacket will come in handy %s.", when);
    } else {
      if (cold || needsWarmJacketFromWind) snprintf(out, n, "A proper jacket and umbrella would be wise %s.", when);
      else                                 snprintf(out, n, "A light jacket and umbrella would be smart %s.", when);
    }
    return;
  }

  if (lightRain) {
    if (!umbrellaFriendly) {
      if (cold || needsJacketFromWind) snprintf(out, n, "A light rain jacket would be smart %s.", when);
      else                             snprintf(out, n, "A light outer layer may come in handy %s.", when);
    } else {
      if (cold || needsJacketFromWind) snprintf(out, n, "A light jacket or umbrella may be useful %s.", when);
      else                             snprintf(out, n, "You may want to bring an umbrella %s.", when);
    }
    return;
  }

  if (needsWarmJacketFromWind) {
    snprintf(out, n, "A warm jacket will feel best in the wind %s.", when);
    return;
  }

  if (cold) {
    if (windy) snprintf(out, n, "A warm jacket will likely feel best %s.", when);
    else       snprintf(out, n, "A warm jacket should be perfect %s.", when);
    return;
  }

  if (cool) {
    if (needsJacketFromWind) snprintf(out, n, "A light jacket will be the better choice %s.", when);
    else                     snprintf(out, n, "A sweater or light jacket should do just fine %s.", when);
    return;
  }

  if (mild) {
    if (windy) snprintf(out, n, "A light jacket is a good idea in the wind %s.", when);
    else       snprintf(out, n, "A sweater or light layer should be enough %s.", when);
    return;
  }

  if (warm) {
    if (veryWindy)      snprintf(out, n, "A T-shirt with a light extra layer may feel best %s.", when);
    else if (windy)     snprintf(out, n, "A T-shirt should be fine, but bring a light layer for the wind %s.", when);
    else if (sunDown)   snprintf(out, n, "A T-shirt is fine, but a light layer may feel nice later %s.", when);
    else                snprintf(out, n, "A T-shirt should be perfect %s.", when);
    return;
  }

  if (windy) {
    snprintf(out, n, "Light clothes should work, but the wind may bite %s.", when);
    return;
  }

  snprintf(out, n, "Shorts and a T-shirt should be perfect %s.", when);
}

// -----------------------------------------------------------------------------
// Fetch Open-Meteo
// -----------------------------------------------------------------------------
static bool fetchOpenMeteo(const WeatherInstanceConfig& cfg, WeatherCache& out) {
  String url = "https://api.open-meteo.com/v1/forecast?latitude=";
  url += String(cfg.lat, 6);
  url += "&longitude=";
  url += String(cfg.lon, 6);

  url += "&current=temperature_2m,weather_code,relative_humidity_2m";
  url += "&hourly=temperature_2m,weather_code,wind_speed_10m,precipitation,relative_humidity_2m";
  url += "&daily=sunrise,sunset";
  url += "&windspeed_unit=ms";
  url += "&timezone=auto";
  url += "&forecast_days=5";

  int httpCode = 0;
  String body;
  bool ok = NetClient::httpGet(url, httpCode, body);
  if (!ok || httpCode != 200) return false;

  StaticJsonDocument<24576> doc;
  if (deserializeJson(doc, body)) return false;

  JsonObject current = doc["current"];
  if (current.isNull()) return false;

  out.tempC = current["temperature_2m"] | NAN;
  out.humidity = current["relative_humidity_2m"] | NAN;
  out.currentWmo = current["weather_code"] | -1;

  out.hiC = NAN; out.loC = NAN; out.windMaxMs = NAN; out.precipMm = NAN;
  out.wmo = out.currentWmo;

  out.restValid = false;
  out.restHiC = NAN;
  out.restLoC = NAN;
  out.restWindMaxMs = NAN;
  out.restPrecipMm = NAN;
  out.restWmo = out.currentWmo;

  out.dayCount = 0;
  for (int i = 0; i < WeatherCache::MAX_DAYS; i++) out.days[i] = DayForecast();

  out.sunriseHHMM[0] = 0;
  out.sunsetHHMM[0]  = 0;

  JsonObject daily = doc["daily"];
  if (!daily.isNull()) {
    JsonArray sr = daily["sunrise"].as<JsonArray>();
    JsonArray ss = daily["sunset"].as<JsonArray>();
    if (!sr.isNull() && sr.size() > 0) extractHHMM(out.sunriseHHMM, sr[0] | "");
    if (!ss.isNull() && ss.size() > 0) extractHHMM(out.sunsetHHMM,  ss[0] | "");
  }

  JsonObject hourly = doc["hourly"];
  if (!hourly.isNull()) {
    JsonArray timeArr = hourly["time"].as<JsonArray>();
    JsonArray tArr    = hourly["temperature_2m"].as<JsonArray>();
    JsonArray wmoArr  = hourly["weather_code"].as<JsonArray>();
    JsonArray windArr = hourly["wind_speed_10m"].as<JsonArray>();
    JsonArray prArr   = hourly["precipitation"].as<JsonArray>();

    const int N = (int)timeArr.size();
    const int START_H = 0;
    const int END_H   = 24;

    char dates[WeatherCache::MAX_DAYS][11] = {{0}};
    int dateCount = 0;

    struct WmoCount { int wmo; int count; };
    WmoCount counts[WeatherCache::MAX_DAYS][16];
    int countsN[WeatherCache::MAX_DAYS] = {0,0,0,0,0};

    WmoCount restCounts[16];
    int restCountsN = 0;

    auto dayIndexForISO = [&](const char* iso) -> int {
      if (!iso || strlen(iso) < 10) return -1;
      char ymd[11]; copyYMD10(ymd, iso);

      for (int i = 0; i < dateCount; i++) {
        if (strcmp(dates[i], ymd) == 0) return i;
      }
      if (dateCount >= WeatherCache::MAX_DAYS) return -1;

      strlcpy(dates[dateCount], ymd, sizeof(dates[dateCount]));
      out.days[dateCount].valid = false;
      strlcpy(out.days[dateCount].dateYMD, ymd, sizeof(out.days[dateCount].dateYMD));
      countsN[dateCount] = 0;
      return dateCount++;
    };

    auto bumpWmo = [&](WmoCount* arr, int& arrN, int wmo) {
      for (int i = 0; i < arrN; i++) {
        if (arr[i].wmo == wmo) { arr[i].count++; return; }
      }
      if (arrN < 16) {
        arr[arrN].wmo = wmo;
        arr[arrN].count = 1;
        arrN++;
      }
    };

    auto chooseDominantWmo = [&](WmoCount* arr, int arrN, int fallbackWmo, float precipMm) -> int {
      int chosen = fallbackWmo;

      if (arrN > 0) {
        int bestWmo  = arr[0].wmo;
        int bestCnt  = arr[0].count;
        int bestRank = wmoSeverityRank(bestWmo);

        for (int i = 1; i < arrN; i++) {
          int w = arr[i].wmo;
          int c = arr[i].count;
          int r = wmoSeverityRank(w);
          if (c > bestCnt || (c == bestCnt && r > bestRank)) {
            bestWmo  = w;
            bestCnt  = c;
            bestRank = r;
          }
        }
        chosen = bestWmo;

        if (!isnan(precipMm) && precipMm > PRECIP_MEANINGFUL_MM) {
          int pWmo = -1;
          int pCnt = -1;
          int pRank = -1;

          for (int i = 0; i < arrN; i++) {
            int w = arr[i].wmo;
            int c = arr[i].count;
            if (!isPrecipWmo(w)) continue;

            int r = wmoSeverityRank(w);
            if (c > pCnt || (c == pCnt && r > pRank)) {
              pWmo = w;
              pCnt = c;
              pRank = r;
            }
          }

          if (pWmo >= 0) chosen = pWmo;
        }
      }

      return chosen;
    };

    bool anyDay[WeatherCache::MAX_DAYS] = {false,false,false,false,false};
    bool anyRestToday = false;

    const char* currentTimeIso = current["time"] | "";
    char currentYMD[11] = {0};
    int currentHour = -1;
    copyYMD10(currentYMD, currentTimeIso);
    parseHourFromIso8601(currentTimeIso, currentHour);

    for (int i = 0; i < N; i++) {
      const char* ts = timeArr[i] | "";
      int hour = -1;
      if (!parseHourFromIso8601(ts, hour)) continue;
      if (hour < START_H || hour >= END_H) continue;

      int di = dayIndexForISO(ts);
      if (di < 0 || di >= WeatherCache::MAX_DAYS) continue;

      float temp = (i < (int)tArr.size())    ? (tArr[i]    | NAN) : NAN;
      float wind = (i < (int)windArr.size()) ? (windArr[i] | NAN) : NAN;
      float pr   = (i < (int)prArr.size())   ? (prArr[i]   | NAN) : NAN;
      int   wmo  = (i < (int)wmoArr.size())  ? (wmoArr[i]  | -1)  : -1;

      DayForecast& day = out.days[di];

      if (!isnan(temp)) {
        if (!anyDay[di]) { day.loC = temp; day.hiC = temp; }
        else {
          if (temp < day.loC) day.loC = temp;
          if (temp > day.hiC) day.hiC = temp;
        }
      }

      if (!isnan(wind)) {
        if (isnan(day.windMaxMs) || wind > day.windMaxMs) day.windMaxMs = wind;
      }

      if (!isnan(pr) && pr > 0) {
        if (isnan(day.precipMm)) day.precipMm = 0.0f;
        day.precipMm += pr;
      }

      if (wmo >= 0) bumpWmo(counts[di], countsN[di], wmo);
      anyDay[di] = true;

      bool sameDateAsCurrent = (currentYMD[0] && strlen(ts) >= 10 && strncmp(ts, currentYMD, 10) == 0);
      bool isRestOfToday = sameDateAsCurrent && currentHour >= 0 && hour >= currentHour;

      if (isRestOfToday) {
        if (!isnan(temp)) {
          if (!anyRestToday) {
            out.restLoC = temp;
            out.restHiC = temp;
          } else {
            if (temp < out.restLoC) out.restLoC = temp;
            if (temp > out.restHiC) out.restHiC = temp;
          }
        }

        if (!isnan(wind)) {
          if (isnan(out.restWindMaxMs) || wind > out.restWindMaxMs) out.restWindMaxMs = wind;
        }

        if (!isnan(pr) && pr > 0) {
          if (isnan(out.restPrecipMm)) out.restPrecipMm = 0.0f;
          out.restPrecipMm += pr;
        }

        if (wmo >= 0) bumpWmo(restCounts, restCountsN, wmo);
        anyRestToday = true;
      }
    }

    out.dayCount = dateCount;

    for (int di = 0; di < out.dayCount; di++) {
      DayForecast& day = out.days[di];
      if (!anyDay[di]) continue;

      day.valid = true;
      if (isnan(day.precipMm)) day.precipMm = 0.0f;

      day.wmo = chooseDominantWmo(counts[di], countsN[di], out.currentWmo, day.precipMm);
      day.wmo = normalizeDisplayWmoForTemps(day.wmo, day.loC, day.hiC);
    }

    if (out.dayCount > 0 && out.days[0].valid) {
      out.hiC = out.days[0].hiC;
      out.loC = out.days[0].loC;
      out.windMaxMs = out.days[0].windMaxMs;
      out.precipMm  = out.days[0].precipMm;
      out.wmo       = normalizeDisplayWmoForTemps(out.days[0].wmo, out.days[0].loC, out.days[0].hiC);
    }

    if (anyRestToday) {
      out.restValid = true;
      if (isnan(out.restPrecipMm)) out.restPrecipMm = 0.0f;
      out.restWmo = chooseDominantWmo(restCounts, restCountsN, out.currentWmo, out.restPrecipMm);
      out.restWmo = normalizeDisplayWmoForTemps(out.restWmo, out.restLoC, out.restHiC);
    } else {
      out.restValid = false;
      out.restHiC = out.hiC;
      out.restLoC = out.loC;
      out.restWindMaxMs = out.windMaxMs;
      out.restPrecipMm = out.precipMm;
      out.restWmo = out.wmo;
    }
  }

  strlcpy(out.condition, conditionFromWmo(out.wmo), sizeof(out.condition));
  return true;
}

static void tick(int idx) {
  WeatherInstanceConfig& cfg = g_inst[idx];
  WeatherCache& cache = g_cache[idx];

  if (cfg.lat == 0 || cfg.lon == 0) return;

  uint32_t now = millis();
  bool needs = (!cache.valid) || ((now - cache.fetchedAtMs) > cfg.refreshMs);
  if (!needs) return;

  WeatherCache fresh = cache;
  if (fetchOpenMeteo(cfg, fresh)) {
    fresh.valid = true;
    fresh.fetchedAtMs = now;
    cache = fresh;
  }
}

// -----------------------------------------------------------------------------
// Defaults + apply FrameConfig
// -----------------------------------------------------------------------------
static void ensureDefaultsOnce() {
  static bool inited = false;
  if (inited) return;
  inited = true;

  for (int i = 0; i < MAX_INSTANCES; i++) {
    g_inst[i] = WeatherInstanceConfig();
    g_inst[i].id = (uint8_t)(i + 1);
    g_cache[i] = WeatherCache();
  }
}

static bool cfgChanged(const WeatherInstanceConfig& oldCfg,
                       float lat, float lon,
                       const char* label,
                       const char* units,
                       uint32_t refreshMs,
                       bool showHiLo,
                       bool showCondition) {
  if (fabsf(oldCfg.lat - lat) > 0.00001f) return true;
  if (fabsf(oldCfg.lon - lon) > 0.00001f) return true;
  if (strcmp(oldCfg.label, label ? label : "") != 0) return true;
  if (strcmp(oldCfg.units, units ? units : "") != 0) return true;
  if (oldCfg.refreshMs != refreshMs) return true;
  if (oldCfg.showHiLo != showHiLo) return true;
  if (oldCfg.showCondition != showCondition) return true;
  return false;
}

static WeatherInstanceConfig makeInactiveWeatherInstance(uint8_t id) {
  WeatherInstanceConfig cfg;
  cfg.id = id;
  cfg.lat = 0.0f;
  cfg.lon = 0.0f;
  cfg.label[0] = 0;
  strlcpy(cfg.units, "metric", sizeof(cfg.units));
  cfg.refreshMs = 600000UL;
  cfg.showHiLo = true;
  cfg.showCondition = true;
  return cfg;
}

static void applyConfigFromFrameConfig() {
  if (!g_cfg) return;

  ensureDefaultsOnce();

  WeatherInstanceConfig oldInst[MAX_INSTANCES];
  for (int i = 0; i < MAX_INSTANCES; i++) {
    oldInst[i] = g_inst[i];
    g_inst[i] = makeInactiveWeatherInstance((uint8_t)(i + 1));
  }

  for (int i = 0; i < (int)g_cfg->weatherCount && i < MAX_INSTANCES; i++) {
    const WeatherModuleConfig& src = g_cfg->weather[i];
    if (src.id < 1) continue;

    int idx = instIndex(src.id);
    WeatherInstanceConfig& dst = g_inst[idx];
    const WeatherInstanceConfig& oldCfg = oldInst[idx];

    char labelLatin1[40] = {0};
    if (src.label[0]) utf8ToLatin1(labelLatin1, sizeof(labelLatin1), src.label);

    const char* unitsIn = src.units[0] ? src.units : "metric";

    bool changed = cfgChanged(oldCfg,
                              src.lat,
                              src.lon,
                              labelLatin1,
                              unitsIn,
                              src.refreshMs,
                              src.showHiLo,
                              src.showCondition);

    dst.id  = src.id;
    dst.lat = src.lat;
    dst.lon = src.lon;
    strlcpy(dst.label, labelLatin1, sizeof(dst.label));
    strlcpy(dst.units, unitsIn, sizeof(dst.units));
    dst.refreshMs     = src.refreshMs;
    dst.showHiLo      = src.showHiLo;
    dst.showCondition = src.showCondition;

    if (changed) {
      g_cache[idx] = WeatherCache();
    }
  }
}

// -----------------------------------------------------------------------------
// Rendering helpers for wind/precip strings
// -----------------------------------------------------------------------------
static void buildWindStr(char* out, size_t n, float windMaxMs) {
  if (!out || n == 0) return;
  if (!isnan(windMaxMs) && windMaxMs > 0.20f) {
    int w = (int)lroundf(windMaxMs);
    snprintf(out, n, "Wind up to %d m/s", w);
  } else {
    strlcpy(out, "Calm winds", n);
  }
}

// -----------------------------------------------------------------------------
// Rendering
// -----------------------------------------------------------------------------
static void renderSmall(const Cell& c,
                        const WeatherInstanceConfig& cfg,
                        const WeatherCache& data) {
  uint16_t ink = Theme::ink();
  auto& d = DisplayCore::get();

  if (!data.valid) {
    drawCenteredBox(c.x, c.y, c.w, c.h, "Weather", FONT_B12, ink);
    return;
  }

  const bool useRest = data.restValid;
  float smallHiC     = useRest ? data.restHiC       : data.hiC;
  float smallLoC     = useRest ? data.restLoC       : data.loC;
  float smallWindMax = useRest ? data.restWindMaxMs : data.windMaxMs;
  float smallPrecip  = useRest ? data.restPrecipMm  : data.precipMm;
  int   smallWmo     = useRest ? data.restWmo       : data.wmo;

  char locationName[48] = {0};
  getDisplayLocationName(cfg, locationName, sizeof(locationName));

  const int gap = 18;
  const int dividerW = 1;
  const float EPS_WIND = 0.20f;

  char tempRange[28] = {0};
  if (cfg.showHiLo && !isnan(smallLoC) && !isnan(smallHiC)) {
    float lo = smallLoC, hi = smallHiC;
    const char* suf = "C";
    if (cfg.units && strcmp(cfg.units, "imperial") == 0) {
      lo = (smallLoC * 9.0f / 5.0f) + 32.0f;
      hi = (smallHiC * 9.0f / 5.0f) + 32.0f;
      suf = "F";
    }
    int l = (int)lroundf(lo);
    int h = (int)lroundf(hi);
    snprintf(tempRange, sizeof(tempRange), "%d to %d\xB0%s", l, h, suf);
  } else {
    formatTemp(tempRange, sizeof(tempRange), data.tempC, cfg.units);
  }

  char windStr[32] = {0};
  if (!isnan(smallWindMax) && smallWindMax > EPS_WIND) {
    int w = (int)lroundf(smallWindMax);
    snprintf(windStr, sizeof(windStr), "Wind up to %d m/s", w);
  } else {
    strlcpy(windStr, "Calm winds", sizeof(windStr));
  }

  char rainStr[24] = {0};
  buildPrecipStr(rainStr, sizeof(rainStr), smallPrecip, smallWmo, smallLoC, smallHiC);

  int16_t lx1, ly1; uint16_t lw, lh;
  measureText(locationName, FONT_B12, lx1, ly1, lw, lh);

  int16_t x1, y1;
  uint16_t wTemp, hTemp, wWind, hWind, wRain, hRain;
  measureText(tempRange, FONT_B12, x1, y1, wTemp, hTemp);
  measureText(windStr,  FONT_B12, x1, y1, wWind, hWind);
  measureText(rainStr,  FONT_B12, x1, y1, wRain, hRain);

  int totalLineW = (int)wTemp + gap + dividerW + gap
                 + (int)wWind + gap + dividerW + gap
                 + (int)wRain;

  int16_t fy1; uint16_t fh;
  fontBoxMetrics(FONT_B12, fy1, fh);

  const int underlineGap = 4;
  const int underlineH = 2;
  const int lineGap = 20;

  int totalH = (int)lh + underlineGap + underlineH + lineGap + (int)fh;
  int topY = c.y + (c.h - totalH) / 2;

  int titleBaseline = topY - ly1;

  drawTextCenteredAt(c.x + c.w / 2, titleBaseline, locationName, FONT_B12, ink);

  {
    int underlineY = topY + (int)lh + underlineGap;
    int underlineX = c.x + c.w / 2 - (int)lw / 2;
    d.fillRect(underlineX, underlineY, (int)lw, underlineH, ink);
  }

  int lineBaseline = topY + (int)lh + underlineGap + underlineH + lineGap - fy1;

  int contentW = (int)lroundf(c.w * 0.95f);
  int contentX = c.x + (c.w - contentW) / 2;
  int startX = contentX + (contentW - totalLineW) / 2;

  int cx = startX;
  drawLeft(cx, lineBaseline, tempRange, FONT_B12, ink);
  cx += (int)wTemp + gap;

  drawDividerAtX(cx, lineBaseline, FONT_B12, ink);
  cx += dividerW + gap;

  drawLeft(cx, lineBaseline, windStr, FONT_B12, ink);
  cx += (int)wWind + gap;

  drawDividerAtX(cx, lineBaseline, FONT_B12, ink);
  cx += dividerW + gap;

  drawLeft(cx, lineBaseline, rainStr, FONT_B12, ink);
}

static void renderMedium(const Cell& c,
                         const WeatherInstanceConfig& cfg,
                         const WeatherCache& data) {
  uint16_t ink = Theme::ink();
  auto& d = DisplayCore::get();

  if (!data.valid) {
    drawCenteredBox(c.x, c.y, c.w, c.h, "Weather", FONT_B12, ink);
    return;
  }

  const bool useRest = data.restValid;

  float medHiC      = useRest ? data.restHiC       : data.hiC;
  float medLoC      = useRest ? data.restLoC       : data.loC;
  float medWindMax  = useRest ? data.restWindMaxMs : data.windMaxMs;
  float medPrecip   = useRest ? data.restPrecipMm  : data.precipMm;
  int   medWmo      = useRest ? data.restWmo       : data.wmo;

  char loBuf[16] = {0};
  char hiBuf[16] = {0};
  if (cfg.showHiLo && !isnan(medLoC) && !isnan(medHiC)) {
    formatTemp(loBuf, sizeof(loBuf), medLoC, cfg.units);
    formatTemp(hiBuf, sizeof(hiBuf), medHiC, cfg.units);
  } else {
    formatTemp(loBuf, sizeof(loBuf), data.tempC, cfg.units);
    strlcpy(hiBuf, loBuf, sizeof(hiBuf));
  }

  char windStr[32] = {0};
  buildWindStr(windStr, sizeof(windStr), medWindMax);

  char precipStr[24] = {0};
  buildPrecipStr(precipStr, sizeof(precipStr), medPrecip, medWmo, medLoC, medHiC);

  char clothingStr[96] = {0};
  buildClothingSuggestion(clothingStr, sizeof(clothingStr),
                          data.tempC, medHiC, medLoC,
                          medWindMax, medPrecip, medWmo,
                          data.sunriseHHMM, data.sunsetHHMM);

  int16_t b12Y1; uint16_t b12H;
  int16_t b9Y1;  uint16_t b9H;
  fontBoxMetrics(FONT_B12, b12Y1, b12H);
  fontBoxMetrics(FONT_B9,  b9Y1,  b9H);

  int16_t lx1, ly1; uint16_t lw, lh;
  int16_t rx1, ry1; uint16_t rw, rh;
  measureText(loBuf, FONT_B12, lx1, ly1, lw, lh);
  measureText(hiBuf, FONT_B12, rx1, ry1, rw, rh);

  const int topPad = 20;
  const int mmGap = 10;
  const int dividerW = 1;

  int totalTempW = (int)lw + mmGap + dividerW + mmGap + (int)rw;
  int tempStartX = c.x + (c.w - totalTempW) / 2;
  int tempTop = c.y + topPad;
  int tempBaseline = tempTop - b12Y1;

  int tx = tempStartX;
  drawLeft(tx, tempBaseline, loBuf, FONT_B12, ink);
  tx += (int)lw + mmGap;
  drawDividerAtXShort(tx, tempBaseline, FONT_B12, ink);
  tx += dividerW + mmGap;
  drawLeft(tx, tempBaseline, hiBuf, FONT_B12, ink);

  const int bottomPad = 35;
  const int gapWindToPrecip = 5;
  const int gapIconToWind = 10;
  const int gapClothingToIcon = 10;
  const int gapTempToClothing = 10;

  int precipBaseline = c.y + c.h - bottomPad - b9Y1;
  int precipTop      = precipBaseline + b9Y1;

  int windTop        = precipTop - gapWindToPrecip - (int)b9H;
  int windBaseline   = windTop - b9Y1;

  drawTextCenteredAt(c.x + c.w / 2, windBaseline, windStr, FONT_B9, ink);
  drawTextCenteredAt(c.x + c.w / 2, precipBaseline, precipStr, FONT_B9, ink);

  int clothingTop = tempTop + (int)b12H + gapTempToClothing;
  int iconBottomLimit = windTop - gapIconToWind;

  int availableMidH = iconBottomLimit - clothingTop;
  if (availableMidH < 30) availableMidH = 30;

  int clothingBlockH = (int)lroundf((float)availableMidH * 0.34f);
  if (clothingBlockH < 18) clothingBlockH = 18;
  if (clothingBlockH > 34) clothingBlockH = 34;

  int clothingY = clothingTop;
  int iconRegionTop = clothingY + clothingBlockH + gapClothingToIcon;
  int iconRegionH = iconBottomLimit - iconRegionTop;
  if (iconRegionH < 22) iconRegionH = 22;

  drawWrappedTextBox(
    c.x + 12,
    clothingY,
    c.w - 24,
    clothingBlockH,
    clothingStr,
    FONT_B9,
    ink,
    0
  );

  int iconSize = iconRegionH;
  int maxByW = c.w - 24;
  if (iconSize > maxByW) iconSize = maxByW;
  if (iconSize < 36) iconSize = 36;

  int iconCy = iconRegionTop + iconRegionH / 2;
  int minIconTop = iconRegionTop;
  int iconTop = iconCy - iconSize / 2;
  if (iconTop < minIconTop) {
    iconTop = minIconTop;
    iconCy = iconTop + iconSize / 2;
  }

  ModuleIcons::drawWeatherIcon(c.x + c.w / 2, iconCy, iconSize, medWmo);
}

static void renderMiniDay(int x, int y, int w, int h,
                          const char* dayLabel,
                          const DayForecast& day,
                          const WeatherInstanceConfig& cfg,
                          uint16_t ink,
                          int headerShiftY = 0) {
  char windLine[32] = {0};
  char precipLine[24] = {0};

  if (day.valid) {
    buildWindStr(windLine, sizeof(windLine), day.windMaxMs);
    buildPrecipStr(precipLine, sizeof(precipLine), day.precipMm, day.wmo, day.loC, day.hiC);
  } else {
    strlcpy(windLine, "Calm winds", sizeof(windLine));
    strlcpy(precipLine, "Mostly dry", sizeof(precipLine));
  }

  char loBuf[12] = {0};
  char hiBuf[12] = {0};
  if (day.valid && !isnan(day.loC) && !isnan(day.hiC)) {
    formatTemp(loBuf, sizeof(loBuf), day.loC, cfg.units);
    formatTemp(hiBuf, sizeof(hiBuf), day.hiC, cfg.units);
  } else {
    strlcpy(loBuf, "--", sizeof(loBuf));
    strlcpy(hiBuf, "--", sizeof(hiBuf));
  }

  int16_t dayY1;   uint16_t dayTextH;
  int16_t tempY1;  uint16_t tempTextH;
  int16_t infoY1;  uint16_t infoTextH;
  fontBoxMetrics(FONT_B12, dayY1,  dayTextH);
  fontBoxMetrics(FONT_B12, tempY1, tempTextH);
  fontBoxMetrics(FONT_B9,  infoY1, infoTextH);

  const int dayBoxH    = 16;
  const int tempBoxH   = (int)tempTextH;
  const int windBoxH   = 14;
  const int precipBoxH = 14;

  const int topGap          = 25;
  const int gapTempToWind   = 10;
  const int gapWindToPrecip = 5;
  const int bottomGap       = 20;

  int precipBaseline = y + h - bottomGap - infoY1;
  int precipTop      = precipBaseline + infoY1;

  int windTop        = precipTop - gapWindToPrecip - windBoxH;
  int windBaseline   = windTop - infoY1;

  int tempTop        = windTop - gapTempToWind - tempBoxH;
  int tempBaseline   = tempTop - tempY1;

  int dayTop         = y + topGap + headerShiftY;
  int dayBaseline    = dayTop - dayY1;

  int middleTop      = dayTop + dayBoxH;
  int middleBottom   = tempTop;
  int middleH        = middleBottom - middleTop;
  if (middleH < 12) middleH = 12;

  int iconSize = (int)lroundf((float)w * 0.46f);
  if (iconSize > w - 18) iconSize = w - 18;
  if (iconSize > middleH) iconSize = middleH;
  if (iconSize < 16) iconSize = 16;

  int iconGap = middleH - iconSize;
  if (iconGap < 0) iconGap = 0;

  int iconTop = middleTop + iconGap / 2;
  int iconCy  = iconTop + iconSize / 2;
  int iconCx  = x + w / 2;

  int wmo = day.valid ? day.wmo : -1;

  int16_t lx1, ly1; uint16_t lw, lh;
  int16_t rx1, ry1; uint16_t rw, rh;
  measureText(loBuf, FONT_B12, lx1, ly1, lw, lh);
  measureText(hiBuf, FONT_B12, rx1, ry1, rw, rh);

  const int gap = 6;
  const int dividerW2 = 1;
  int totalTempW = (int)lw + gap + dividerW2 + gap + (int)rw;
  int tempStartX = x + (w - totalTempW) / 2;

  drawCenteredBox(x, dayTop, w, dayBoxH, dayLabel, FONT_B12, ink);

  ModuleIcons::drawWeatherIcon(iconCx, iconCy, iconSize, wmo);

  int cx = tempStartX;
  drawLeft(cx, tempBaseline, loBuf, FONT_B12, ink);
  cx += (int)lw + gap;
  drawDividerAtXShort(cx, tempBaseline, FONT_B12, ink);
  cx += dividerW2 + gap;
  drawLeft(cx, tempBaseline, hiBuf, FONT_B12, ink);

  drawCenteredBox(x, windTop,   w, windBoxH,   windLine,   FONT_B9, ink);
  drawCenteredBox(x, precipTop, w, precipBoxH, precipLine, FONT_B9, ink);
}

static void renderLargeXL(const Cell& c,
                          const WeatherInstanceConfig& cfg,
                          const WeatherCache& data) {
  uint16_t ink = Theme::ink();
  auto& d = DisplayCore::get();

  if (!data.valid) {
    drawCenteredBox(c.x, c.y, c.w, c.h, "Weather", FONT_B12, ink);
    return;
  }

  const bool isXL = (c.size == CELL_XL);

  if (!isXL) {
    char locationName[48] = {0};
    getDisplayLocationName(cfg, locationName, sizeof(locationName));

    const int topPad = 22;
    const int titleUnderlineGap = 4;
    const int titleUnderlineH = 2;

    int16_t stx1, sty1; uint16_t stw, sth;
    measureText(locationName, FONT_B12, stx1, sty1, stw, sth);

    int titleBaseline = c.y + topPad - sty1;
    drawTextCenteredAt(c.x + c.w / 2, titleBaseline, locationName, FONT_B12, ink);

    int titleUnderlineY = (titleBaseline + sty1) + (int)sth + titleUnderlineGap;
    int titleUnderlineX = c.x + c.w / 2 - (int)stw / 2;
    d.fillRect(titleUnderlineX, titleUnderlineY, (int)stw, titleUnderlineH, ink);

    int regionTop = titleUnderlineY + titleUnderlineH + 10;
    int regionBot = c.y + c.h - 10;
    int regionH   = regionBot - regionTop;
    if (regionH < 90) return;

    const int cols = 4;
    int baseColW = c.w / cols;
    int extra = c.w - baseColW * cols;

    int16_t dayY1;   uint16_t dayTextH;
    int16_t tempY1;  uint16_t tempTextH;
    int16_t infoY1;  uint16_t infoTextH;
    fontBoxMetrics(FONT_B12, dayY1,  dayTextH);
    fontBoxMetrics(FONT_B12, tempY1, tempTextH);
    fontBoxMetrics(FONT_B9,  infoY1, infoTextH);

    const int dayBoxH    = 16;
    const int tempBoxH   = (int)tempTextH;
    const int windBoxH   = 14;
    const int precipBoxH = 14;

    const int topGap          = 16;
    const int gapTempToWind   = 10;
    const int gapWindToPrecip = 8;
    const int bottomGap       = 14;
    const int tempShiftDown   = 4;

    int sharedDividerTop = regionTop;
    int sharedDividerBottom = regionBot;

    for (int i = 0; i < 4; i++) {
      int colW = baseColW + ((i < extra) ? 1 : 0);

      int precipBaseline = regionTop + regionH - bottomGap - infoY1;
      int precipTop      = precipBaseline + infoY1;

      int windTop        = precipTop - gapWindToPrecip - windBoxH;

      int tempTopBase    = windTop - gapTempToWind - tempBoxH;
      int tempTop        = tempTopBase + tempShiftDown;

      int dayTop         = regionTop + topGap;
      int middleTop      = dayTop + dayBoxH;
      int middleBottom   = tempTopBase;
      int middleH        = middleBottom - middleTop;
      if (middleH < 12) middleH = 12;

      int iconSize = (int)lroundf((float)colW * 0.46f);
      if (iconSize > colW - 18) iconSize = colW - 18;
      if (iconSize > middleH)   iconSize = middleH;
      if (iconSize < 32)        iconSize = 32;

      int dividerTop = dayTop;
      int dividerBottom = precipTop + precipBoxH;

      (void)tempTop;
      (void)iconSize;

      if (i == 0 || dividerTop < sharedDividerTop) sharedDividerTop = dividerTop;
      if (i == 0 || dividerBottom > sharedDividerBottom) sharedDividerBottom = dividerBottom;
    }

    for (int i = 1; i < cols; i++) {
      int dx = c.x + i * baseColW + ((i <= extra) ? i : extra);
      int lineY = sharedDividerTop;
      int lineH = sharedDividerBottom - sharedDividerTop;
      if (lineH > 0) d.drawFastVLine(dx, lineY, lineH, ink);
    }

    for (int i = 0; i < 4; i++) {
      int colX = c.x + i * baseColW + ((i < extra) ? i : extra);
      int colW = baseColW + ((i < extra) ? 1 : 0);
      int colCx = colX + colW / 2;

      DayForecast day = {};
      if (i == 0) {
        if (!fillTodayRestForecast(data, day)) {
          if (i < data.dayCount) day = data.days[i];
        }
      } else {
        if (i < data.dayCount) day = data.days[i];
      }

      char dayLabel[12] = {0};
      if (i == 0) {
        strlcpy(dayLabel, "Today", sizeof(dayLabel));
      } else if (day.dateYMD[0]) {
        int yy=0, mm=0, dd=0;
        if (parseYMDFromIso8601(day.dateYMD, yy, mm, dd)) {
          const char* wd = weekdayNameShort(weekdayIndex(yy, mm, dd));
          strlcpy(dayLabel, wd, sizeof(dayLabel));
        } else {
          strlcpy(dayLabel, "--", sizeof(dayLabel));
        }
      } else {
        strlcpy(dayLabel, "--", sizeof(dayLabel));
      }

      char loBuf[12] = {0};
      char hiBuf[12] = {0};
      if (day.valid && !isnan(day.loC) && !isnan(day.hiC)) {
        formatTemp(loBuf, sizeof(loBuf), day.loC, cfg.units);
        formatTemp(hiBuf, sizeof(hiBuf), day.hiC, cfg.units);
      } else {
        strlcpy(loBuf, "--", sizeof(loBuf));
        strlcpy(hiBuf, "--", sizeof(hiBuf));
      }

      char windLine[32] = {0};
      char precipLine[24] = {0};

      if (day.valid) {
        buildWindStr(windLine, sizeof(windLine), day.windMaxMs);
        buildPrecipStr(precipLine, sizeof(precipLine), day.precipMm, day.wmo, day.loC, day.hiC);
      } else {
        strlcpy(windLine, "Calm winds", sizeof(windLine));
        strlcpy(precipLine, "Mostly dry", sizeof(precipLine));
      }

      int precipBaseline = regionTop + regionH - bottomGap - infoY1;
      int precipTop      = precipBaseline + infoY1;

      int windTop        = precipTop - gapWindToPrecip - windBoxH;
      int windBaseline   = windTop - infoY1;

      int tempTopBase    = windTop - gapTempToWind - tempBoxH;
      int tempTop        = tempTopBase + tempShiftDown;
      int tempBaseline   = tempTop - tempY1;

      int dayTop         = regionTop + topGap;
      int dayBaseline    = dayTop - dayY1;

      int middleTop      = dayTop + dayBoxH;
      int middleBottom   = tempTopBase;
      int middleH        = middleBottom - middleTop;
      if (middleH < 12) middleH = 12;

      int iconSize = (int)lroundf((float)colW * 0.46f);
      if (iconSize > colW - 18) iconSize = colW - 18;
      if (iconSize > middleH)   iconSize = middleH;
      if (iconSize < 32)        iconSize = 32;

      int iconTop = middleTop + (middleH - iconSize) / 2;
      int iconCy  = iconTop + iconSize / 2;

      int16_t lx1, ly1; uint16_t lw, lh;
      int16_t rx1, ry1; uint16_t rw, rh;
      measureText(loBuf, FONT_B12, lx1, ly1, lw, lh);
      measureText(hiBuf, FONT_B12, rx1, ry1, rw, rh);

      const int gap = 6;
      const int dividerW2 = 1;
      int totalTempW = (int)lw + gap + dividerW2 + gap + (int)rw;
      int tempStartX = colX + (colW - totalTempW) / 2;

      drawCenteredBox(colX, dayTop, colW, dayBoxH, dayLabel, FONT_B12, ink);

      ModuleIcons::drawWeatherIcon(colCx, iconCy, iconSize, day.valid ? day.wmo : -1);

      int tx = tempStartX;
      drawLeft(tx, tempBaseline, loBuf, FONT_B12, ink);
      tx += (int)lw + gap;
      drawDividerAtXShort(tx, tempBaseline, FONT_B12, ink);
      tx += dividerW2 + gap;
      drawLeft(tx, tempBaseline, hiBuf, FONT_B12, ink);

      drawCenteredBox(colX, windTop,   colW, windBoxH,   windLine,   FONT_B9, ink);
      drawCenteredBox(colX, precipTop, colW, precipBoxH, precipLine, FONT_B9, ink);

      (void)dayBaseline;
    }

    return;
  }

  // ---------------------------------------------------------------------------
  // XL
  // ---------------------------------------------------------------------------
  const int topH = c.h / 2;
  const int botY = c.y + topH;
  const int botH = c.h - topH;

  {
    int divW = (int)lroundf((float)c.w * 0.95f);
    int divX = c.x + (c.w - divW) / 2;
    int divY = botY;
    d.drawFastHLine(divX, divY, divW, ink);
  }

  DayForecast today = {};
  if (!fillTodayRestForecast(data, today)) {
    if (data.dayCount > 0 && data.days[0].valid) today = data.days[0];
    else {
      today.valid = true;
      today.hiC = data.hiC;
      today.loC = data.loC;
      today.windMaxMs = data.windMaxMs;
      today.precipMm = data.precipMm;
      today.wmo = data.wmo;
    }
  }

  char nowBuf[16] = {0};
  char loBuf[16]  = {0};
  char hiBuf[16]  = {0};
  formatTemp(nowBuf, sizeof(nowBuf), data.tempC, cfg.units);
  formatTemp(loBuf,  sizeof(loBuf),  today.loC, cfg.units);
  formatTemp(hiBuf,  sizeof(hiBuf),  today.hiC, cfg.units);

  char humStr[20] = {0};
  if (!isnan(data.humidity)) snprintf(humStr, sizeof(humStr), "Humidity %d%%", (int)lroundf(data.humidity));
  else strlcpy(humStr, "Humidity --%", sizeof(humStr));

  char windStr[32] = {0};
  char precipStr[24] = {0};
  buildWindStr(windStr, sizeof(windStr), today.windMaxMs);
  buildPrecipStr(precipStr, sizeof(precipStr), today.precipMm, today.wmo, today.loC, today.hiC);

  char clothingStr[96] = {0};
  buildClothingSuggestion(clothingStr, sizeof(clothingStr),
                          data.tempC, today.hiC, today.loC,
                          today.windMaxMs, today.precipMm, today.wmo,
                          data.sunriseHHMM, data.sunsetHHMM);

  char locationName[48] = {0};
  getDisplayLocationName(cfg, locationName, sizeof(locationName));

  const int leftW   = c.w / 3;
  const int midW    = c.w / 3;
  const int rightW  = c.w - leftW - midW;

  const int leftX   = c.x;
  const int midX    = c.x + leftW;
  const int rightX  = midX + midW;

  int16_t fy9, fy18;
  uint16_t fh9, fh18;
  fontBoxMetrics(FONT_B9,  fy9,  fh9);
  fontBoxMetrics(FONT_B18, fy18, fh18);

  const char* title = "Today";
  const int headerH = 28;
  const int headerY = c.y + 14;
  const int underlineGap = 3;
  const int underlineThickness = 3;

  int16_t titleX1, titleY1;
  uint16_t titleW, titleH;
  measureText(title, FONT_B18, titleX1, titleY1, titleW, titleH);

  drawCenteredBox(midX, headerY, midW, headerH, title, FONT_B18, ink);

  {
    const int locPadX = 8;
    const int locBaseline = c.y + 16;
    drawLeft(c.x + locPadX, locBaseline, locationName, FONT_B9, ink);
  }

  int titleBottomY = 0;
  {
    int titleCellCenterY = headerY + headerH / 2;
    int titleBaselineY = titleCellCenterY - (int)titleH / 2 - (int)titleY1;
    int titleTopY = titleBaselineY + (int)titleY1;
    titleBottomY = titleTopY + (int)titleH;

    int underlineY = titleBottomY + underlineGap;
    int underlineX = midX + (midW - (int)titleW) / 2;

    for (int i = 0; i < underlineThickness; i++) {
      d.drawFastHLine(underlineX, underlineY + i, (int)titleW, ink);
    }
  }

  {
    int divTop = c.y + 54;
    int divBot = c.y + topH - 26;
    int divH = divBot - divTop;
    if (divH > 8) {
      d.drawFastVLine(midX, divTop, divH, ink);
      d.drawFastVLine(rightX, divTop, divH, ink);
    }
  }

  const int contentTop = titleBottomY + 12;
  const int contentBot = c.y + topH - 18;
  int contentH = contentBot - contentTop;
  if (contentH < 50) contentH = 50;

  // LEFT CELL ---------------------------------------------------------------
  {
    const int lineH = 16;
    const int rowGap = 4;
    const int mmGap = 6;
    const int dividerW2 = 1;

    int16_t lx1, ly1; uint16_t lw, lh;
    int16_t rx1, ry1; uint16_t rw, rh;
    measureText(loBuf, FONT_B9, lx1, ly1, lw, lh);
    measureText(hiBuf, FONT_B9, rx1, ry1, rw, rh);

    int totalTempW = (int)lw + mmGap + dividerW2 + mmGap + (int)rw;

    int totalBlockH =
        lineH + rowGap +
        lineH + rowGap +
        lineH + rowGap +
        lineH + rowGap +
        lineH;

    int blockTop = contentTop + (contentH - totalBlockH) / 2;
    int currentY = blockTop;

    int mmBaseline = currentY + (lineH - (int)fh9) / 2 - fy9;
    int mmStartX = leftX + (leftW - totalTempW) / 2;

    int tx = mmStartX;
    drawLeft(tx, mmBaseline, loBuf, FONT_B9, ink);
    tx += (int)lw + mmGap;
    drawDividerAtXShort(tx, mmBaseline, FONT_B9, ink);
    tx += dividerW2 + mmGap;
    drawLeft(tx, mmBaseline, hiBuf, FONT_B9, ink);

    currentY += lineH + rowGap;
    drawCenteredBox(leftX, currentY, leftW, lineH, windStr, FONT_B9, ink);

    currentY += lineH + rowGap;
    drawCenteredBox(leftX, currentY, leftW, lineH, precipStr, FONT_B9, ink);

    currentY += lineH + rowGap;
    drawSunRangeLine(leftX, currentY, leftW, lineH, data.sunriseHHMM, data.sunsetHHMM, ink, FONT_B9);

    currentY += lineH + rowGap;
    drawCenteredBox(leftX, currentY, leftW, lineH, humStr, FONT_B9, ink);
  }

  // MIDDLE CELL -------------------------------------------------------------
  {
    int iconSize = (int)lroundf((float)midW * 0.40f);
    int maxByW = midW - 28;
    if (iconSize > maxByW) iconSize = maxByW;
    if (iconSize < 40) iconSize = 40;

    int tempBoxH = (int)fh18 + 4;
    const int gapIconToTemp = 6;
    int combinedH = iconSize + gapIconToTemp + tempBoxH;

    if (combinedH > contentH) {
      iconSize = contentH - gapIconToTemp - tempBoxH;
      if (iconSize < 34) iconSize = 34;
      combinedH = iconSize + gapIconToTemp + tempBoxH;
    }

    int blockTop = contentTop + (contentH - combinedH) / 2;
    int iconTop = blockTop - 4;
    int iconCy = iconTop + iconSize / 2;
    int iconCx = midX + midW / 2;

    ModuleIcons::drawWeatherIcon(iconCx, iconCy, iconSize, today.wmo);

    int nowY = iconTop + iconSize + gapIconToTemp;
    drawCenteredBox(midX, nowY, midW, tempBoxH, nowBuf, FONT_B18, ink);
  }

  // RIGHT CELL --------------------------------------------------------------
  {
    drawWrappedTextBox(
      rightX,
      contentTop,
      rightW,
      contentH,
      clothingStr,
      FONT_B9,
      ink,
      5
    );
  }

  // BOTTOM 4 DAYS -----------------------------------------------------------
  const int cols = 4;
  int colW = c.w / cols;
  int extra = c.w - colW * cols;

  for (int i = 1; i < cols; i++) {
    int dx = c.x + i * colW;
    if (i <= extra) dx += i;
    d.drawFastVLine(dx, botY + 6, botH - 12, ink);
  }

  for (int i = 0; i < cols; i++) {
    int x = c.x + i * colW + ((i < extra) ? i : extra);
    int w = colW + ((i < extra) ? 1 : 0);

    int di = i + 1;
    DayForecast day = {};
    if (di < data.dayCount) day = data.days[di];

    char label[12] = {0};
    if (day.dateYMD[0]) {
      int yy=0, mm=0, dd=0;
      if (parseYMDFromIso8601(day.dateYMD, yy, mm, dd)) {
        const char* wd = weekdayNameShort(weekdayIndex(yy, mm, dd));
        strlcpy(label, wd, sizeof(label));
      } else {
        strlcpy(label, "--", sizeof(label));
      }
    } else {
      strlcpy(label, "--", sizeof(label));
    }

    renderMiniDay(x, botY + 4, w, botH - 8, label, day, cfg, ink, -6);
  }
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------
namespace ModuleWeather {

void setConfig(const FrameConfig* cfg) {
  g_cfg = cfg;
  ensureDefaultsOnce();
  applyConfigFromFrameConfig();
}

void render(const Cell& c, const String& moduleName) {
  ensureDefaultsOnce();
  if (g_cfg) applyConfigFromFrameConfig();

  uint8_t id = parseInstanceId(moduleName);
  int idx = instIndex(id);

  tick(idx);

  const WeatherInstanceConfig& cfg = g_inst[idx];
  const WeatherCache& data = g_cache[idx];

  if (cfg.lat == 0 || cfg.lon == 0) {
    drawCenteredBox(c.x, c.y, c.w, c.h, "Set location", FONT_B12, Theme::ink());
    return;
  }

  if (c.size == CELL_SMALL)       renderSmall(c, cfg, data);
  else if (c.size == CELL_MEDIUM) renderMedium(c, cfg, data);
  else if (c.size == CELL_LARGE)  renderLargeXL(c, cfg, data);
  else if (c.size == CELL_XL)     renderLargeXL(c, cfg, data);
  else                            renderMedium(c, cfg, data);
}

} // namespace ModuleWeather