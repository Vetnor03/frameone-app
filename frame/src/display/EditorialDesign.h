#pragma once

// RE:MIND editorial layout grammar.
// Pixel geometry, not legacy SMALL/MEDIUM/LARGE/XL names, determines composition.
// Header-only and allocation-free so firmware modules can share it on the ESP32.
namespace EditorialDesign {

enum Shape {
  COMPACT,  // little space in both axes: show one useful fact
  RIBBON,   // wide and shallow: arrange roles horizontally
  COLUMN,   // narrow and tall: vertical rhythm
  CARD,     // balanced: editorial heading plus content
  SPREAD    // spacious: content, metrics and optional art
};

enum Role {
  HERO,
  HEADING,
  PRIMARY,
  SECONDARY,
  LIST_ITEM,
  MEASUREMENT,
  FIGURE,
  DIVIDER
};

enum FontToken {
  REGULAR_9,
  REGULAR_12,
  BOLD_12,
  BOLD_18
};

// Priority is independent of rendering: modules choose which information to
// give a role. The system then chooses whether/how that role can fit.
enum Priority {
  ESSENTIAL,
  IMPORTANT,
  OPTIONAL,
  DECORATIVE
};

struct Plan {
  Shape shape;
  int width;
  int height;
  int inset;
  int gap;
  int columns;
  int safeWidth;
  int safeHeight;
  bool illustrationsAllowed;
  bool ornamentalDividerAllowed;
};

struct RoleSpec {
  FontToken font;
  int maxLines;
  bool visible;
  bool wrap;
};

inline int minInt(int a, int b) { return a < b ? a : b; }
inline int maxInt(int a, int b) { return a > b ? a : b; }

inline Plan planFor(int width, int height) {
  width = maxInt(0, width);
  height = maxInt(0, height);
  Shape shape = CARD;
  if (height < 152 && width >= 300) shape = RIBBON;
  else if (width < 260 && height >= 152) shape = COLUMN;
  else if (width < 260 || height < 152) shape = COMPACT;
  else if (width >= 530 && height >= 215) shape = SPREAD;
  const int inset = (width < 260 || height < 155) ? 8 :
                    (width >= 530 && height >= 215) ? 16 : 12;
  const int gap = (width >= 530 && height >= 215) ? 12 :
                  (width < 260 || height < 155) ? 6 : 8;
  const int safeWidth = maxInt(0, width - 2 * inset);
  const int safeHeight = maxInt(0, height - 2 * inset);
  int columns = 1;
  // No automatic three-column density: text must remain legible.
  if ((shape == RIBBON && safeWidth >= 440) ||
      (shape == SPREAD && safeWidth >= 420)) columns = 2;
  return {shape, width, height, inset, gap, columns, safeWidth, safeHeight,
          shape == SPREAD && safeHeight >= 240 && safeWidth >= 560,
          safeWidth >= 610 && safeHeight >= 200};
}

inline RoleSpec specFor(const Plan& p, Role role) {
  const bool spacious = p.shape == SPREAD;
  const bool tight = p.shape == COMPACT || p.shape == RIBBON;
  switch (role) {
    case HERO:
      return {spacious ? BOLD_18 : BOLD_12, 2, p.safeHeight >= 24, false};
    case HEADING:
      return {(spacious || p.shape == CARD || (p.shape == RIBBON && p.safeWidth >= 440)) ? BOLD_12 : REGULAR_9,
              1, p.safeHeight >= 38, false};
    case PRIMARY:
      return {spacious ? REGULAR_12 : REGULAR_9, tight ? 2 : 3,
              p.safeHeight >= 16, true};
    case SECONDARY:
      return {REGULAR_9, tight ? 1 : 2, p.safeHeight >= 90, true};
    case LIST_ITEM:
      return {spacious ? REGULAR_12 : REGULAR_9, tight ? 1 : 2,
              p.safeHeight >= 36, true};
    case MEASUREMENT:
      return {spacious ? BOLD_18 : BOLD_12, 1,
              p.safeHeight >= 26, false};
    case FIGURE:
      return {REGULAR_9, 0, p.illustrationsAllowed, false};
    case DIVIDER:
      return {REGULAR_9, 0, p.safeWidth >= 140, false};
  }
  return {REGULAR_9, 1, false, false};
}

inline bool shouldShow(const Plan& p, Role role, Priority priority) {
  if (priority == ESSENTIAL) return specFor(p, role).visible;
  if (priority == DECORATIVE) {
    if (role == FIGURE) return p.illustrationsAllowed;
    if (role == DIVIDER) return p.ornamentalDividerAllowed;
    return false;
  }
  if (priority == IMPORTANT) {
    return specFor(p, role).visible &&
           (role != SECONDARY || p.safeHeight >= 90);
  }
  // Optional copy should never take space away from essential content.
  return specFor(p, role).visible &&
         p.safeHeight >= 165 && p.safeWidth >= 220;
}

inline int listCapacity(const Plan& p, int contentHeight, int minimumRow = 28) {
  if (contentHeight < minimumRow || minimumRow <= 0 || p.safeWidth < 60) return 0;
  const int rows = contentHeight / (minimumRow + p.gap);
  return maxInt(0, minInt(8, rows));
}

inline bool matchesModule(const char* name, const char* base) {
  if (!name || !base) return false;
  int i = 0;
  while (base[i]) {
    if (!name[i]) return false;
    const char a = (name[i] >= 'A' && name[i] <= 'Z') ? name[i] + 32 : name[i];
    if (a != base[i]) return false;
    ++i;
  }
  return name[i] == '\0' || name[i] == ':';
}

enum ContentKind {
  DATE_FACTS,
  REMINDER_LIST,
  WEATHER_FACTS,
  NEWS_LIST,
  SURF_FACTS,
  SKI_FACTS,
  COUNTDOWN_FACTS,
  SOCCER_LIST,
  STOCKS_FACTS,
  GROCERY_LIST,
  ASSISTANT_TEXT,
  UNKNOWN
};

inline ContentKind kindFor(const char* module) {
  if (matchesModule(module, "date")) return DATE_FACTS;
  if (matchesModule(module, "reminders")) return REMINDER_LIST;
  if (matchesModule(module, "weather")) return WEATHER_FACTS;
  if (matchesModule(module, "news")) return NEWS_LIST;
  if (matchesModule(module, "surf")) return SURF_FACTS;
  if (matchesModule(module, "ski")) return SKI_FACTS;
  if (matchesModule(module, "countdown")) return COUNTDOWN_FACTS;
  if (matchesModule(module, "soccer")) return SOCCER_LIST;
  if (matchesModule(module, "stocks")) return STOCKS_FACTS;
  if (matchesModule(module, "groceries")) return GROCERY_LIST;
  if (matchesModule(module, "assistant")) return ASSISTANT_TEXT;
  return UNKNOWN;
}

struct ContentBudget {
  bool heading;            // Visible section header, if useful for this module
  bool secondary;          // Context after primary facts
  bool illustration;       // Purely decorative line art
  bool splitColumns;       // Geometry has enough width for real columns
  int listItems;           // Safe maximum rows (not a mandate to fill)
};

// A single geometry-based disclosure policy for all content categories.
// Module data decides WHAT is important; this decides HOW MUCH can fit.
// The budget is intentionally conservative for 1-bit 800x480 output.
inline ContentBudget budgetFor(const Plan& p, ContentKind kind) {
  const bool ribbon = p.shape == RIBBON;
  const bool compact = p.shape == COMPACT;
  const bool roomy = p.shape == SPREAD;
  const bool list = kind == REMINDER_LIST || kind == NEWS_LIST ||
                    kind == SOCCER_LIST || kind == GROCERY_LIST;
  const bool measurement = kind == WEATHER_FACTS || kind == SURF_FACTS ||
                           kind == SKI_FACTS || kind == STOCKS_FACTS;
  const int headerFloor = list ? 95 : 110;
  const bool heading = kind != DATE_FACTS && !compact &&
                       p.safeHeight >= headerFloor && (!ribbon || p.safeHeight >= 120);
  const bool secondary = p.safeHeight >= (measurement ? 85 : 125) &&
                         p.safeWidth >= 145;
  const bool illustration = p.illustrationsAllowed &&
                            (kind == DATE_FACTS || kind == WEATHER_FACTS);
  const bool split = p.columns == 2 && p.safeWidth >= 420 &&
                     (list || kind == DATE_FACTS || measurement);
  const int listHeight = p.safeHeight - (heading ? 34 : 0) -
                         (secondary ? 18 : 0);
  const int rowPixels = kind == REMINDER_LIST ? 88 :
                        kind == NEWS_LIST ? 45 :
                        kind == GROCERY_LIST ? 35 : 38;
  const int listItems = list
      ? minInt(8, maxInt(0, listHeight / (rowPixels + p.gap)) * (split ? 2 : 1))
      : 0;
  return {heading, secondary, illustration, split, listItems};
}

} // namespace EditorialDesign
