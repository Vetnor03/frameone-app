from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
HEADER = ROOT / "src" / "display" / "EditorialTypography.h"


def test_shared_font_tokens_apply_to_compact_card_and_spread():
    assert HEADER.exists()
    compiler = shutil.which("g++") or shutil.which("clang++")
    assert compiler is not None
    program = r"""
#include "EditorialTypography.h"
#include <cassert>
struct Font { int id; };
using namespace EditorialDesign;
int main() {
  const Font r9{9}, r12{12}, b12{112}, b18{118};
  const Plan compact = planFor(200, 120);
  const Plan card = planFor(400, 240);
  const Plan spread = planFor(800, 480);
  assert(EditorialTypography::choose(compact, HEADING, &r9, &r12, &b12, &b18) == &r9);
  assert(EditorialTypography::choose(card, HEADING, &r9, &r12, &b12, &b18) == &b12);
  assert(EditorialTypography::choose(spread, PRIMARY, &r9, &r12, &b12, &b18) == &r12);
  assert(EditorialTypography::choose(spread, HERO, &r9, &r12, &b12, &b18) == &b18);
  assert(EditorialTypography::choose(spread, PRIMARY, &r9, nullptr, &b12, &b18) == &r9);
  assert(EditorialTypography::lineStep(REGULAR_9) < EditorialTypography::lineStep(BOLD_18));
  return 0;
}
"""
    with tempfile.TemporaryDirectory() as d:
        src = Path(d) / "editorial_type.cpp"
        output = Path(d) / "editorial_type"
        src.write_text(program, encoding="utf-8")
        subprocess.run([
            compiler, "-std=c++11", "-Wall", "-Wextra", "-Werror",
            "-I", str(HEADER.parent), str(src), "-o", str(output),
        ], check=True, capture_output=True, text=True)
        subprocess.run([str(output)], check=True, capture_output=True, text=True)
