"""Extract the exact production C++ adaptive Groceries renderer for native 1-bit QA.
Never manually reimplement its geometry, menu rules, list capacity or date logic.
"""
from pathlib import Path
src=Path("frame/src/modules/ModuleGroceries.cpp").read_text(encoding="utf-8")
begin="// BEGIN ADAPTIVE GROCERIES RENDERER"
end="// END ADAPTIVE GROCERIES RENDERER"
assert src.count(begin)==src.count(end)==1
fragment=src[src.index(begin):src.index(end)+len(end)]
for required in [
  '#include "GroceriesEditorialPreview.h"',
  "GroceriesAdaptivePolicy::compose(input)",
  "getRotationStep4h()",
  "wrapIndex(rotation + i, g_cache.count)",
  "groceriesEditorialItem(item,x,y,width",
  "layout.showMenu",
  "layout.showRunningLow",
  "layout.showMealIdeas",
  "adaptiveFutureDinner(today, i)",
  "formatItem(item, raw, sizeof(raw))",
  "if (g_cache.count > capacity",
]:
    assert required in fragment, required
target=Path("frame/tests/native/groceries")
(target/"extracted_adaptive.cpp.inc").write_text(
    "// GENERATED FROM ModuleGroceries.cpp. DO NOT EDIT.\n"+
    "#line 1057 \"frame/src/modules/ModuleGroceries.cpp\"\n"+
    fragment+"\n",encoding="utf-8")
print("Extracted original source-owned adaptive renderer:", len(fragment), "bytes")
