#pragma once

#include <stddef.h>
#include <stdint.h>

namespace CountdownAdaptivePolicy {

enum Family : uint8_t { HORIZONTAL, STACK, SPLIT_HORIZONTAL, EXPANDED_VERTICAL };
struct Event { const char* title; const char* metric; };
struct Input {
  int width, height;
  const char* title;
  const char* count;
  const char* unit;
  const char* displayDate;
  const char* targetDate;
  const Event* events;
  int eventCount;
};
struct Result {
  Family family;
  bool showTitle, showDate, showCalendar;
  int upcomingRows, overflow, splitPercent;
};

inline int minInt(int a, int b) { return a < b ? a : b; }
inline int maxInt(int a, int b) { return a > b ? a : b; }
inline int absInt(int value) { return value < 0 ? -value : value; }
inline bool contains(const char* chars, char needle) {
  for (; chars && *chars; ++chars) if (*chars == needle) return true;
  return false;
}

// Font is 9, 12, or 18. This is intentionally identical to Studio's estimator.
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
inline int usefulness(const char* value, int width, int font = 9) {
  if (!value || !value[0]) return 0;
  return minInt(100, width * 100 / maxInt(1, estimatedWidth(value, font)));
}

inline bool effectiveDate(const char* displayDate, const char* targetDate, char* out, size_t outSize) {
  if (!out || !outSize) return false;
  out[0] = 0;
  const char* value = displayDate && displayDate[0] ? displayDate : targetDate;
  if (!value || !value[0]) return false;
  // Firmware targets are ISO dates; display dates are already presentation-ready.
  size_t length = 0; while (value[length]) ++length;
  if ((!displayDate || !displayDate[0]) && length >= 10 && value[4] == '-' && value[7] == '-') {
    const char formatted[11] = {value[8], value[9], '.', value[5], value[6], '.', value[0], value[1], value[2], value[3], 0};
    value = formatted;
    size_t i = 0; for (; value[i] && i + 1 < outSize; ++i) out[i] = value[i]; out[i] = 0;
    return out[0] != 0;
  }
  size_t i = 0; for (; value[i] && i + 1 < outSize; ++i) out[i] = value[i]; out[i] = 0;
  return out[0] != 0;
}

inline Result compose(const Input& in) {
  Result out{STACK, false, false, false, 0, 0, 0};
  const int pad = maxInt(8, minInt(18, minInt(in.width, in.height) * 7 / 100));
  const int iw = in.width - pad * 2, ih = in.height - pad * 2;
  char date[32];
  const bool hasTitle = in.title && in.title[0], hasDate = effectiveDate(in.displayDate, in.targetDate, date, sizeof(date));
  const int numberNeeds = maxInt(30, estimatedWidth(in.count, 18) + 8);
  const int unitNeeds = maxInt(32, estimatedWidth(in.unit, 9) + 8);
  if (ih < 92 || (in.width > in.height && ih < 170)) {
    out.family = HORIZONTAL;
    const int dateNeeds = hasDate ? estimatedWidth(date, 9) + 18 : 0;
    const int titleRoom = iw - numberNeeds - unitNeeds - dateNeeds - 30;
    out.showTitle = hasTitle && titleRoom >= 70 && usefulness(in.title, titleRoom, 12) >= 28;
    out.showDate = hasDate && iw - numberNeeds - unitNeeds - (out.showTitle ? maxInt(70, titleRoom) : 0) >= dateNeeds + 8;
    out.overflow = in.eventCount;
    return out;
  }
  const int heroMinH = hasTitle ? 118 : 91, rowH = 28, headerH = 25, gap = 14;
  int bestScore = -1;
  static const int splits[] = {40, 45, 50, 55, 60};
  if (iw >= 390 && ih >= 240 && in.eventCount && !(iw >= 430 && ih >= 390 && absInt(iw - ih) < 100)) {
    for (int si = 0; si < 5; ++si) {
      const int percent = splits[si], heroW = (iw - gap) * percent / 100, listW = iw - gap - heroW;
      if (heroW < numberNeeds + 12 || listW < 130 || ih < heroMinH) continue;
      const int capacity = maxInt(0, (ih - headerH + 4) / (rowH + 4));
      const int metricW = minInt(120, maxInt(62, listW * 38 / 100)), titleW = listW - metricW - 10;
      int rows = 0, score = usefulness(in.title, heroW, 12);
      for (int i = 0; i < minInt(in.eventCount, capacity); ++i) {
        if (titleW >= 54 && usefulness(in.events[i].title, titleW) >= 22 && estimatedWidth(in.events[i].metric, 9) <= metricW) {
          ++rows; score += 80 + usefulness(in.events[i].title, titleW);
        } else break;
      }
      if (rows && score > bestScore) { bestScore = score; out.family = SPLIT_HORIZONTAL; out.splitPercent = percent; out.upcomingRows = rows; }
    }
  }
  if (bestScore >= 0) {
    out.showTitle = hasTitle; out.showDate = hasDate && ih >= 145;
    out.overflow = maxInt(0, in.eventCount - out.upcomingRows); return out;
  }
  out.showTitle = hasTitle && ih >= 105; out.showDate = hasDate && ih >= 130;
  out.showCalendar = iw >= 430 && ih >= 390 && in.eventCount <= maxInt(0, (ih - heroMinH - gap - headerH) / (rowH + 4)) && iw / 7 >= 42;
  const int calendarH = out.showCalendar ? minInt(190, ih * 42 / 100) : 0;
  int capacity = maxInt(0, (ih - heroMinH - (calendarH ? calendarH + gap : 0) - gap - headerH + 4) / (rowH + 4));
  if (iw < 300 || (in.width > in.height && ih < 240)) capacity = 0;
  const int metricW = minInt(120, maxInt(62, iw * 30 / 100)), titleW = iw - metricW - 10;
  for (int i = 0; i < minInt(in.eventCount, capacity); ++i) {
    if (titleW >= 54 && usefulness(in.events[i].title, titleW) >= 22 && estimatedWidth(in.events[i].metric, 9) <= metricW) ++out.upcomingRows;
    else break;
  }
  out.family = out.upcomingRows ? EXPANDED_VERTICAL : STACK;
  out.overflow = maxInt(0, in.eventCount - out.upcomingRows);
  return out;
}

} // namespace CountdownAdaptivePolicy
