#pragma once

#include <stdint.h>

// Allocation-free counterpart of app/lib/groceriesResponsive.mjs. Keep this
// Arduino-independent: the host parity test compiles it as GNU C++11.
namespace GroceriesAdaptivePolicy {

enum Family : uint8_t { EMPTY, MICRO, ITEM_STRIP, LIST_STACK,
                        LIST_COLUMNS, LIST_MENU, EXPANDED };
enum RunningLowMode : uint8_t { RUNNING_FULL, RUNNING_NAME, RUNNING_TRUNCATED_NAME };

struct Input {
  int width;
  int height;
  bool failed;
  uint8_t groceryCount;
  uint8_t dinnerCount;
  uint8_t futureDinnerCount;
  bool hasTodayDinner;
  uint8_t runningLowCount;
  uint8_t mealIdeaCount;
};

struct Result {
  Family family;
  bool failed;
  bool horizontal;
  uint8_t columns;
  bool showMenu;
  bool showRunningLow;
  bool showMealIdeas;
  bool todayIsHeading;
};

inline Result compose(const Input& in) {
  Result out = {EMPTY, in.failed, false, 1, false, false, false, false};
  const bool empty = !in.failed && in.groceryCount == 0 &&
    in.dinnerCount == 0 &&
    in.runningLowCount == 0 && in.mealIdeaCount == 0;
  if (in.failed || empty) return out;

  if (in.width < 230 && in.height < 150) out.family = MICRO;
  else if (in.height < 165) out.family = ITEM_STRIP;
  else if (in.width < 270) out.family = LIST_STACK;
  else if ((in.width >= 620 && in.height >= 300) ||
           (in.width >= 360 && in.height >= 390)) out.family = EXPANDED;
  else if (in.width >= 480 && in.height >= 190) out.family = LIST_MENU;
  else out.family = LIST_COLUMNS;

  out.horizontal = out.family == ITEM_STRIP;
  out.columns = out.family == LIST_COLUMNS && in.width >= 360 ? 2 : 1;
  out.showMenu = (out.family == LIST_MENU || out.family == EXPANDED) &&
    in.width >= 500 && in.height >= 180 && in.futureDinnerCount >= 2;
  out.showRunningLow = out.family == EXPANDED && in.height >= 300 && in.runningLowCount > 0;
  out.showMealIdeas = out.family == EXPANDED && in.height >= 390 && in.mealIdeaCount > 0;
  out.todayIsHeading = in.hasTodayDinner && !out.showMenu;
  return out;
}

inline RunningLowMode runningLowMode(bool fullFits, bool nameFits) {
  return fullFits ? RUNNING_FULL : (nameFits ? RUNNING_NAME : RUNNING_TRUNCATED_NAME);
}

// Candidate widths are measured with complete ingredient tokens included.
inline uint8_t mealMissingCount(bool twoFit, bool oneFits) {
  return twoFit ? 2 : (oneFits ? 1 : 0);
}

} // namespace GroceriesAdaptivePolicy
