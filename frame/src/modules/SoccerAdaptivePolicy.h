#pragma once

#include <stdint.h>

// Allocation-free counterpart of app/lib/soccerResponsive.mjs. Keep this
// policy independent of Arduino so the exact decisions can be host tested.
namespace SoccerAdaptivePolicy {

enum Family : uint8_t { MICRO, FIXTURE_STRIP, FIXTURE_STACK, FIXTURE_HISTORY,
                        FIXTURE_STANDINGS, EXPANDED, EMPTY };
enum PrimaryState : uint8_t { PRIMARY_NEXT, PRIMARY_PREVIOUS, PRIMARY_STANDING, PRIMARY_EMPTY };

struct Input {
  int width;
  int height;
  bool landscape;
  bool hasNext;
  bool hasPrevious;
  bool hasStanding;
  int tableCount;
  int detailCount;
};

struct Result {
  Family family;
  bool available;
  PrimaryState primaryState;
  bool showStanding;
  bool showPrevious;
  bool showTable;
  uint8_t tableColumns;
  int tableRows;
  bool showDetails;
  int detailRows;
};

inline int minInt(int a, int b) { return a < b ? a : b; }
inline int maxInt(int a, int b) { return a > b ? a : b; }

inline Result compose(const Input& in) {
  Result out = {EMPTY, false, PRIMARY_EMPTY, false, false, false, 0, 0, false, 0};
  const bool hasTable = in.tableCount > 0;
  out.available = in.hasNext || in.hasPrevious || in.hasStanding || hasTable;
  if (!out.available) return out;

  if (in.width < 230 && in.height < 150) out.family = MICRO;
  else if (in.height < 160) out.family = FIXTURE_STRIP;
  else if (in.width < 260) out.family = FIXTURE_STACK;
  else if (in.width >= 560 && in.height >= 300) out.family = FIXTURE_STANDINGS;
  else if (in.height >= 390 && in.width >= 360) out.family = EXPANDED;
  else out.family = FIXTURE_HISTORY;

  out.primaryState = in.hasNext ? PRIMARY_NEXT : in.hasPrevious ? PRIMARY_PREVIOUS : PRIMARY_STANDING;
  out.showStanding = in.hasStanding && out.family != MICRO;
  const bool wideHistory = out.family == FIXTURE_HISTORY && in.landscape &&
                           in.width >= 500 && in.height >= 190;
  out.showPrevious = in.hasPrevious && in.hasNext &&
    (out.family == FIXTURE_STACK || out.family == FIXTURE_HISTORY ||
     out.family == FIXTURE_STANDINGS || out.family == EXPANDED) &&
    (in.height >= 250 || wideHistory);

  const int tableWidth = out.family == FIXTURE_STANDINGS ? minInt(in.width * 46 / 100, 360) :
                         out.family == EXPANDED ? in.width - 28 : 0;
  const int tableHeight = out.family == FIXTURE_STANDINGS ? in.height - 28 :
                          out.family == EXPANDED ? minInt(180, in.height * 38 / 100) : 0;
  if (hasTable && tableHeight >= 96) {
    if (tableWidth >= 300) out.tableColumns = 5;
    else if (tableWidth >= 235) out.tableColumns = 4;
    else if (tableWidth >= 180) out.tableColumns = 3;
  }
  if (out.tableColumns) out.tableRows = minInt(in.tableCount, maxInt(3, (tableHeight - 30) / 22));
  out.showTable = out.tableRows >= 3;
  out.detailRows = in.detailCount;
  out.showDetails = out.family == EXPANDED && in.height >= 420 && in.detailCount > 0;
  return out;
}

} // namespace SoccerAdaptivePolicy
