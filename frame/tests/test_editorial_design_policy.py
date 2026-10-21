from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
HEADER = ROOT / "src" / "display" / "EditorialDesign.h"


def test_shared_editorial_policy_compiles_and_covers_custom_grid():
    assert HEADER.exists()
    compiler = shutil.which("g++") or shutil.which("clang++")
    assert compiler, "C++ host compiler is needed for layout-policy tests"
    program = r"""
#include "EditorialDesign.h"
#include <cassert>
using namespace EditorialDesign;
int main() {
  Plan compact = planFor(200, 120);  // 1x1 grid
  Plan ribbon = planFor(800, 120);   // 4x1 grid
  Plan column = planFor(200, 480);   // 1x4 grid
  Plan card = planFor(400, 240);     // 2x2 grid
  Plan spread = planFor(800, 480);   // full frame
  assert(compact.shape == COMPACT);
  assert(ribbon.shape == RIBBON);
  assert(column.shape == COLUMN);
  assert(card.shape == CARD);
  assert(spread.shape == SPREAD);
  assert(spread.columns == 2);
  assert(compact.columns == 1);
  assert(specFor(compact, PRIMARY).visible);
  assert(specFor(spread, HERO).font == BOLD_18);
  assert(!shouldShow(compact, FIGURE, DECORATIVE));
  assert(shouldShow(spread, FIGURE, DECORATIVE));
  assert(!shouldShow(compact, SECONDARY, OPTIONAL));
  assert(listCapacity(compact, 0) == 0);
  assert(listCapacity(card, 80) > 0);
  assert(kindFor("date") == DATE_FACTS);
  assert(kindFor("reminders") == REMINDER_LIST);
  assert(kindFor("weather:2") == WEATHER_FACTS);
  assert(kindFor("news") == NEWS_LIST);
  assert(kindFor("surf:1") == SURF_FACTS);
  assert(kindFor("ski:1") == SKI_FACTS);
  assert(kindFor("countdown") == COUNTDOWN_FACTS);
  assert(kindFor("soccer:1") == SOCCER_LIST);
  assert(kindFor("stocks:1") == STOCKS_FACTS);
  assert(kindFor("groceries") == GROCERY_LIST);
  assert(kindFor("assistant") == ASSISTANT_TEXT);
  assert(kindFor("weatherwolf") == UNKNOWN);
  assert(planFor(0, 0).safeWidth == 0);
  assert(planFor(0, 0).safeHeight == 0);
  return 0;
}
"""
    with tempfile.TemporaryDirectory() as directory:
        src = Path(directory) / "test.cpp"
        exe = Path(directory) / "editorial-test"
        src.write_text(program, encoding="utf-8")
        subprocess.run([compiler, "-std=c++11", "-Wall", "-Wextra",
                        "-Werror", "-I", str(HEADER.parent), str(src),
                        "-o", str(exe)], check=True, capture_output=True, text=True)
        subprocess.run([str(exe)], check=True, capture_output=True, text=True)
