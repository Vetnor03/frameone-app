"""Verify Groceries R2 only modifies presentation, never selection/data policy."""
from pathlib import Path
import subprocess

path="frame/src/modules/ModuleGroceries.cpp"
current=Path(path).read_text(encoding="utf-8")
base=subprocess.check_output(["git","show",f"origin/main:{path}"],text=True)
def span(text,start,end):
    assert start in text and end in text,(start,end)
    return text[text.index(start):text.index(end)]
# These functions must remain bit-for-bit unchanged from the production main.
for begin,end in [
 ("static int getRotationStep4h()", "static int wrapIndex("),
 ("static int wrapIndex(", "static bool parseYmd10("),
 ("static bool fetchGroceries()", "static void ensureLoaded()"),
 ("static void ensureLoaded()", "static void drawSimpleList("),
 ("static void renderSmall(", "static void renderMedium("),
 ("static void renderMedium(", "static void renderLarge("),
 ("static void renderLarge(", "// BEGIN ADAPTIVE GROCERIES RENDERER"),
 ("static void adaptiveToday(", "static void adaptiveHeading("),
 ("static void renderAdaptiveGroceries(", "// END ADAPTIVE GROCERIES RENDERER"),
 ("void setConfig(", "} // namespace ModuleGroceries"),
]:
    a,b=span(base,begin,end),span(current,begin,end)
    if begin=="static void renderAdaptiveGroceries(":
        # Only painter portions may change. Preserve EVERY input, family,
        # count, rotation, menu/dinner/insight condition and overflow policy.
        for token in (
            "GroceriesAdaptivePolicy::compose(input)",
            "getRotationStep4h()",
            "wrapIndex(rotation + i, g_cache.count)",
            "capacity = min(12, min(capacity, g_cache.count))",
            "g_cache.count > capacity",
            "layout.showMenu",
            "layout.showRunningLow",
            "layout.showMealIdeas",
            "adaptiveFutureDinner(today, i)",
            "formatItem(item, raw, sizeof(raw))",
        ):
            assert token in a and token in b,token
    else:
        assert a==b, f"Nonvisual source modified: {begin}"
assert subprocess.check_output([
    "git","show","origin/main:frame/src/modules/GroceriesAdaptivePolicy.h"
])==Path("frame/src/modules/GroceriesAdaptivePolicy.h").read_bytes()
assert '#include "GroceriesEditorialPreview.h"' in current
assert 'if (capacity >= 2) groceriesEditorialLozenge(x-8,y-5);' in current
print("Groceries source contract: source data, rotation, date/menu/insights, legacy paths unchanged.")
