#pragma once
#include <stdint.h>

namespace AiFollowAdaptivePolicy {

enum Mode { ZERO_FOLLOW, NO_CHANGE, UPDATES };
enum Family { QUIET, MICRO, SHALLOW, SINGLE, LIST, EXPANDED };

struct Input { int width; int height; uint8_t followingCount; uint8_t updateCount; };
struct Output {
  Mode mode;
  Family family;
  uint8_t summaryLines;
  uint8_t visibleCapacity;
  uint8_t overflowCount;
  bool showQuietSecondary;
  bool verboseOverflow;
};

inline Output compose(const Input& in) {
  Output out = {in.followingCount == 0 ? ZERO_FOLLOW : NO_CHANGE, QUIET, 0, 0, 0,
                in.height >= 155, false};
  if (in.updateCount == 0) return out;
  out.mode = UPDATES;
  out.family = LIST;
  if (in.height < 135 && in.width < 240) out.family = MICRO;
  else if (in.height < 165) out.family = SHALLOW;
  else if (in.height < 245) out.family = SINGLE;
  else if (in.height >= 390 && in.width >= 360) out.family = EXPANDED;
  out.summaryLines = (out.family == MICRO || out.family == SHALLOW) ? 1 :
    (out.family == SINGLE ? static_cast<uint8_t>(in.height >= 190 ? 2 : 1) : 2);

  const int pad = in.width * 35 / 1000 < 8 ? 8 : (in.width * 35 / 1000 > 14 ? 14 : in.width * 35 / 1000);
  out.verboseOverflow = in.width - pad * 2 >= 75;
  const int available = in.height - pad - (pad + 30 + 8);
  const int rowGap = 8, rowHeight = 18 + out.summaryLines * 16 + 3, overflowHeight = 18;
  int capacity = (available + rowGap) / (rowHeight + rowGap);
  if (capacity < 1) capacity = 1;
  if (capacity > 4) capacity = 4;
  if (capacity > in.updateCount) capacity = in.updateCount;
  if (out.family == MICRO || out.family == SHALLOW || out.family == SINGLE) capacity = 1;
  while (capacity > 0 && capacity < in.updateCount &&
         capacity * rowHeight + (capacity - 1) * rowGap + overflowHeight + 5 > available) --capacity;
  if (capacity < 1) capacity = 1;
  out.visibleCapacity = static_cast<uint8_t>(capacity);
  out.overflowCount = in.updateCount > capacity ? static_cast<uint8_t>(in.updateCount - capacity) : 0;
  return out;
}
} // namespace AiFollowAdaptivePolicy
