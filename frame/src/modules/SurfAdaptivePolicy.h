#pragma once

#include <stdint.h>

namespace SurfAdaptivePolicy {

enum Family : uint8_t { SHALLOW, STACK, SPLIT, DAYPARTS, EXPANDED };

struct DataNeeds {
  bool dayparts;
  bool daily;
};

struct Input {
  int width;
  int height;
  const char* spot;
  const char* ratingWord;
  const char* waveRange;
  const char* period;
  const char* wind;
  bool hasRating;
  bool experienceRating;
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
  int daypartCount;
  int dailyCount;
  bool showTrend;
  int splitPercent;
  DataNeeds requestedDataNeeds;
};

inline int minInt(int a, int b) { return a < b ? a : b; }
inline int maxInt(int a, int b) { return a > b ? a : b; }
inline bool contains(const char* chars, char needle) {
  for (; chars && *chars; ++chars) if (*chars == needle) return true;
  return false;
}

// Integer estimator mirrored by Studio. It deliberately models the firmware fonts,
// rather than relying on browser font metrics when choosing a composition.
inline int estimatedWidth(const char* value, int font) {
  int units = 0;
  const uint8_t* p = reinterpret_cast<const uint8_t*>(value ? value : "");
  while (*p) {
    uint32_t cp = *p++;
    if ((cp & 0xE0) == 0xC0 && *p) cp = ((cp & 31) << 6) | (*p++ & 63);
    else if ((cp & 0xF0) == 0xE0 && p[0] && p[1]) {
      cp = ((cp & 15) << 12) | ((p[0] & 63) << 6) | (p[1] & 63);
      p += 2;
    }
    if (cp > 127) units += 6;
    else {
      const char ch = static_cast<char>(cp);
      if (ch == ' ') units += 3;
      else if (contains("ilI1.,:;!'|", ch)) units += 3;
      else if (contains("MW@%&", ch)) units += 9;
      else if ((ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9')) units += 7;
      else units += 6;
    }
  }
  const int scale = font == 18 ? 205 : font == 12 ? 142 : 108;
  return (units * scale + 99) / 100;
}

inline DataNeeds dataNeeds(int width, int height) {
  const int pad = maxInt(8, minInt(16, minInt(width, height) * 6 / 100));
  const int iw = width - pad * 2;
  const int ih = height - pad * 2;
  DataNeeds out = {false, false};
  // At least one readable 112px x 92px daypart beside/below a protected hero.
  out.dayparts = (iw >= 360 && ih >= 205) || (iw >= 220 && ih >= 330);
  // Daily is requested only if two 112px entries and a 150px hero can coexist.
  out.daily = out.dayparts && ((iw >= 500 && ih >= 390) || (iw >= 700 && ih >= 315));
  return out;
}

inline Result compose(const Input& in) {
  Result out = {STACK, false, in.hasRating, in.hasRating,
                in.waveRange && in.waveRange[0], false, 0, 0, false, 0,
                dataNeeds(in.width, in.height)};
  const int pad = maxInt(8, minInt(16, minInt(in.width, in.height) * 6 / 100));
  const int iw = in.width - pad * 2;
  const int ih = in.height - pad * 2;
  const int ratingNeed = estimatedWidth(in.ratingWord, 12) + 10;
  const int waveNeed = estimatedWidth(in.waveRange, 12) + 10;
  const int visualNeed = in.experienceRating ? 58 : 98;
  const int primaryNeed = ratingNeed + waveNeed + visualNeed + 24;

  if (ih < 150 && iw >= primaryNeed) {
    out.family = SHALLOW;
    const int spotRoom = iw - primaryNeed - 12;
    out.showSpot = in.spot && in.spot[0] && spotRoom >= 70 &&
                   estimatedWidth(in.spot, 9) <= spotRoom * 3;
    out.showDetails = (in.period && in.period[0]) && iw >= primaryNeed + 62;
  } else if (iw < 285) {
    out.family = STACK;
    out.showSpot = in.spot && in.spot[0] && ih >= 150 &&
                   estimatedWidth(in.spot, 12) <= iw * 3;
    out.showDetails = ih >= 245 && ((in.period && in.period[0]) || (in.wind && in.wind[0]));
  } else {
    out.family = SPLIT;
    out.splitPercent = 58;
    out.showSpot = in.spot && in.spot[0] && ih >= 145 &&
                   estimatedWidth(in.spot, 12) <= iw * 2;
    out.showDetails = ih >= 190 && ((in.period && in.period[0]) || (in.wind && in.wind[0]));
  }

  if (out.requestedDataNeeds.dayparts && in.availableDayparts > 0) {
    const bool beside = iw >= 430 && ih < 390;
    const int regionPixels = beside ? maxInt(0, iw * 42 / 100 - 12) : maxInt(0, ih - 170);
    const int unit = beside ? 112 : 92;
    int capacity = regionPixels / unit;
    if (capacity >= 4) capacity = 4;
    else if (capacity >= 2) capacity = 2;
    else if (capacity >= 1) capacity = 1;
    out.daypartCount = minInt(capacity, in.availableDayparts);
    if (out.daypartCount) out.family = DAYPARTS;
  }
  if (out.requestedDataNeeds.daily && in.availableDaily > 0) {
    const int dailyPixels = iw - 16;
    out.dailyCount = minInt(in.availableDaily, minInt(5, dailyPixels / 112));
    if (out.dailyCount >= 2) out.family = EXPANDED;
    else out.dailyCount = 0;
  }
  out.showTrend = in.hasTrend && ih >= 145 && iw >= 250;
  return out;
}

} // namespace SurfAdaptivePolicy
