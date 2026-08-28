#pragma once

#include <stdint.h>

namespace SurfAdaptivePolicy {

enum Family : uint8_t { SHALLOW_WIDE, STACKED, SPLIT, DAYPART_ENHANCED, EXPANDED_DAILY };
enum TodaysBestLabelMode : uint8_t { BEST_NONE, BEST_COMPACT, BEST_SPACIOUS };

struct SurfDataNeeds { bool dayparts; bool daily; };

struct Input {
  int width;
  int height;
  const char* spot;
  const char* ratingWord;
  const char* waveRange;
  bool experienceRating;
  bool hasPeriod;
  bool hasWind;
  bool hasSwellDirection;
  bool hasWindDirection;
  bool hasTrend;
  bool todaysBest;
  int availableDayparts;
  int availableDaily;
};

struct Result {
  Family family;
  bool showSpot;
  bool showRatingWord;
  bool showRatingVisual;
  bool showWaveRange;
  bool showDetails;
  bool showDirections;
  bool showTrend;
  bool showTodaysBestLabel;
  TodaysBestLabelMode todaysBestLabelMode;
  int daypartCount;
  int dailyCount;
  int splitPercent;
  SurfDataNeeds requestedDataNeeds;
};

inline int minInt(int a, int b) { return a < b ? a : b; }
inline int maxInt(int a, int b) { return a > b ? a : b; }
inline bool narrowGlyph(char value) {
  return value == 'i' || value == 'l' || value == 'I' || value == '1' ||
         value == '.' || value == ',' || value == ':' || value == ' ';
}
inline int estimatedWidth(const char* value, int font) {
  int units = 0;
  for (const unsigned char* p = reinterpret_cast<const unsigned char*>(value ? value : ""); *p;) {
    unsigned int cp = *p++;
    if ((cp & 0xe0) == 0xc0 && *p) { cp = ((cp & 31) << 6) | (*p++ & 63); }
    else if ((cp & 0xf0) == 0xe0 && p[0] && p[1]) { p += 2; cp = 128; }
    if (cp > 127) units += 7;
    else if (narrowGlyph(static_cast<char>(cp))) units += 3;
    else if (cp == 'M' || cp == 'W' || cp == '@') units += 9;
    else units += 7;
  }
  const int scale = font == 18 ? 205 : font == 12 ? 142 : 108;
  return (units * scale + 99) / 100;
}

inline SurfDataNeeds dataNeedsForGeometry(int width, int height) {
  const int area = width * height;
  SurfDataNeeds needs = {false, false};
  needs.dayparts = (width >= 330 && height >= 210) || (width >= 250 && height >= 300);
  needs.daily = width >= 500 && height >= 390 && area >= 210000;
  if (needs.daily) needs.dayparts = true;
  return needs;
}

inline Result compose(const Input& in) {
  Result out = {STACKED, false, true, true, true, false, false, false,
                false, BEST_NONE, 0, 0, 0, dataNeedsForGeometry(in.width, in.height)};
  const int pad = maxInt(8, minInt(18, minInt(in.width, in.height) * 6 / 100));
  const int innerW = maxInt(1, in.width - pad * 2);
  const int innerH = maxInt(1, in.height - pad * 2);
  const bool shallow = innerH < 145 && innerW >= 300;
  const bool veryLarge = out.requestedDataNeeds.daily;
  const bool daypartRoom = out.requestedDataNeeds.dayparts && in.availableDayparts > 0;

  if (shallow) out.family = SHALLOW_WIDE;
  else if (veryLarge) out.family = EXPANDED_DAILY;
  else if (daypartRoom && innerW >= 420 && innerH >= 250) out.family = DAYPART_ENHANCED;
  else if (innerW >= 360 && innerH >= 195) out.family = SPLIT;
  else out.family = STACKED;

  const int heroW = (out.family == SPLIT || out.family == DAYPART_ENHANCED ||
                     out.family == EXPANDED_DAILY) ? innerW * 54 / 100 : innerW;
  const int primaryInline = estimatedWidth(in.ratingWord, 12) +
                            estimatedWidth(in.waveRange, 12) +
                            (in.experienceRating ? 104 : 122) + 32;
  out.showRatingWord = in.ratingWord && in.ratingWord[0] &&
                       (out.family != SHALLOW_WIDE || primaryInline <= innerW);
  out.showWaveRange = in.waveRange && in.waveRange[0];
  out.showRatingVisual = heroW >= 105 && innerH >= 56;
  const int spotFont = innerH >= 190 ? 12 : 9;
  out.showSpot = in.spot && in.spot[0] && innerH >= 105 &&
                 estimatedWidth(in.spot, spotFont) <= innerW;

  const bool anyDetail = in.hasPeriod || in.hasWind;
  if (out.family == SHALLOW_WIDE)
    out.showDetails = anyDetail && innerW - primaryInline >= 62;
  else if (out.family == STACKED)
    out.showDetails = anyDetail && innerH >= 205;
  else
    out.showDetails = anyDetail && innerW - heroW >= 120;
  out.showDirections = out.showDetails && (in.hasSwellDirection || in.hasWindDirection) &&
                       ((out.family == STACKED && innerH >= 270) || out.family == SPLIT ||
                        out.family == DAYPART_ENHANCED || out.family == EXPANDED_DAILY);
  out.showTrend = in.hasTrend && innerW >= 300 && innerH >= 175;

  if (in.todaysBest && innerH >= 90) {
    out.showTodaysBestLabel = true;
    out.todaysBestLabelMode = (innerW >= 430 && innerH >= 220) ? BEST_SPACIOUS : BEST_COMPACT;
    if (out.family == SHALLOW_WIDE && innerW < primaryInline + 90) {
      out.showTodaysBestLabel = false;
      out.todaysBestLabelMode = BEST_NONE;
    }
  }

  if (out.family == DAYPART_ENHANCED || out.family == EXPANDED_DAILY) {
    const int panelW = innerW * 46 / 100 - 10;
    const int byWidth = panelW >= 360 ? 4 : panelW >= 190 ? 2 : panelW >= 92 ? 1 : 0;
    const int byHeight = innerH >= 250 ? 4 : innerH >= 150 ? 2 : innerH >= 82 ? 1 : 0;
    int capacity = minInt(byWidth, byHeight);
    if (capacity == 3) capacity = 2;
    out.daypartCount = minInt(in.availableDayparts, capacity);
  }
  if (out.family == EXPANDED_DAILY) {
    const int dailyWidth = innerW;
    const int capacity = dailyWidth / 112;
    out.dailyCount = capacity >= 2 ? minInt(in.availableDaily, minInt(5, capacity)) : 0;
  }
  if (out.family == SPLIT || out.family == DAYPART_ENHANCED || out.family == EXPANDED_DAILY)
    out.splitPercent = 54;
  return out;
}

} // namespace SurfAdaptivePolicy
