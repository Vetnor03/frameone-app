from pathlib import Path
import shutil, subprocess, tempfile

ROOT = Path(__file__).resolve().parents[1]
REFERENCE = ROOT / 'src' / 'modules' / 'EditorialReferencePolicy.h'
RENDERER = (ROOT / 'src' / 'modules' / 'ModuleRenderer.cpp').read_text(encoding='utf-8')
SURF = (ROOT / 'src' / 'modules' / 'ModuleSurf.cpp').read_text(encoding='utf-8')
LAYOUT = (ROOT / 'src' / 'core' / 'Layout.cpp').read_text(encoding='utf-8')

def test_approved_surf_medium_reference_applies_to_named_and_custom_grid():
    assert REFERENCE.exists()
    assert 'if (colSpan == 2 && rowSpan == 2) return CELL_MEDIUM;' in LAYOUT
    assert 'EditorialReferences::select(contentKind, c.colSpan, c.rowSpan)' in RENDERER
    assert '? CELL_MEDIUM : CELL_ADAPTIVE;' in RENDERER
    assert 'if (c.size == CELL_MEDIUM)' in SURF
    assert 'drawMediumDetailsHalf(' in SURF
    assert 'drawRatingVisualSized(' in SURF
    assert 'data.ratingFromExperience' in SURF
    compiler = shutil.which('g++') or shutil.which('clang++')
    assert compiler
    code = r"""
#include "EditorialReferencePolicy.h"
#include <cassert>
int main() {
  using namespace EditorialDesign;
  using namespace EditorialReferences;
  for(int c=1;c<=4;c++) for(int r=1;r<=4;r++) {
    const bool expected=(c==2 && r==2);
    assert((select(SURF_FACTS,c,r)==SURF_MEDIUM_REFERENCE)==expected);
    assert(select(WEATHER_FACTS,c,r)==ADAPTIVE);
    assert(select(REMINDER_LIST,c,r)==ADAPTIVE);
    assert(select(DATE_FACTS,c,r)==ADAPTIVE);
  }
  return 0;
}
"""
    with tempfile.TemporaryDirectory() as d:
        src=Path(d)/'reference.cpp'
        exe=Path(d)/'reference'
        src.write_text(code,encoding='utf8')
        subprocess.run([compiler,'-std=c++11','-Wall','-Wextra','-Werror',
                        '-I',str(REFERENCE.parent),'-I',str(ROOT/'src'/'display'),
                        str(src),'-o',str(exe)],check=True,capture_output=True,text=True)
        subprocess.run([str(exe)],check=True,capture_output=True,text=True)
