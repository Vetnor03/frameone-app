#pragma once

#include <stdint.h>

// Allocation-free counterpart of app/lib/stocksResponsive.mjs. This header is
// deliberately Arduino-independent so Studio/firmware decisions can be tested
// with a host GNU C++11 compiler.
namespace StocksAdaptivePolicy {

enum Family : uint8_t { MICRO, SUMMARY_STRIP, SUMMARY_STACK, CHART_SUMMARY,
                        DETAIL_CHART, EXPANDED, EMPTY };
enum Detail : uint8_t { DETAIL_OPEN = 1, DETAIL_HIGH = 2, DETAIL_LOW = 4,
                        DETAIL_PREVIOUS_CLOSE = 8, DETAIL_CHANGE = 16 };

struct Input {
  int width;
  int height;
  bool landscape;
  bool available;
  bool validSeries;
  bool hasOpen;
  bool hasHigh;
  bool hasLow;
  bool hasPreviousClose;
  bool hasChange;
};

struct Result {
  Family family;
  bool available;
  bool showChart;
  bool showSelector;
  bool showDetails;
  uint8_t detailMask;
  uint8_t detailCount;
};

inline Result compose(const Input& in) {
  Result out = {EMPTY, false, false, false, false, 0, 0};
  if (!in.available) return out;
  out.available = true;

  if (in.width < 230 && in.height < 150) out.family = MICRO;
  else if (in.height < 160) out.family = SUMMARY_STRIP;
  else if (in.width < 260) out.family = SUMMARY_STACK;
  else if (in.width >= 650 && in.height >= 300) out.family = DETAIL_CHART;
  else if (in.height >= 390 && in.width >= 360) out.family = EXPANDED;
  else out.family = CHART_SUMMARY;

  // These integer comparisons are exact equivalents of Studio's candidate
  // dimensions and avoid floating point in the policy.
  bool usefulWidth = false;
  bool usefulHeight = false;
  bool selectorWidth = false;
  bool selectorHeight = false;
  if (out.family == DETAIL_CHART) {
    usefulWidth = in.width * 54 >= 20400;       // w * .54 - 24 >= 180
    usefulHeight = in.height >= 150;            // h - 68 >= 82
    selectorWidth = in.width * 54 >= 27400;     // candidate width >= 250
    selectorHeight = in.height >= 173;          // candidate height >= 105
  } else if (out.family == EXPANDED) {
    usefulWidth = in.width >= 208;
    usefulHeight = in.height * 40 >= 12200;      // h * .40 - 40 >= 82
    selectorWidth = in.width >= 278;
    selectorHeight = in.height * 40 >= 14500;
  } else if (out.family == CHART_SUMMARY && in.landscape) {
    usefulWidth = in.width * 55 >= 20200;       // w * .55 - 22 >= 180
    usefulHeight = in.height >= 136;
    selectorWidth = in.width * 55 >= 27200;
    selectorHeight = in.height >= 159;
  } else if (out.family == CHART_SUMMARY) {
    usefulWidth = in.width >= 208;
    usefulHeight = in.height * 42 >= 11000;      // h * .42 - 28 >= 82
    selectorWidth = in.width >= 278;
    selectorHeight = in.height * 42 >= 13300;
  }
  out.showChart = in.validSeries && usefulWidth && usefulHeight;
  out.showSelector = out.showChart && selectorWidth && selectorHeight;
  out.showDetails = (out.family == DETAIL_CHART || out.family == EXPANDED ||
                     out.family == SUMMARY_STACK) && in.height >= 300;

  const bool fields[5] = {in.hasOpen, in.hasHigh, in.hasLow, in.hasPreviousClose, in.hasChange};
  for (uint8_t i = 0; i < 5; ++i) if (fields[i]) {
    out.detailMask |= static_cast<uint8_t>(1u << i);
    ++out.detailCount;
  }
  return out;
}

} // namespace StocksAdaptivePolicy
