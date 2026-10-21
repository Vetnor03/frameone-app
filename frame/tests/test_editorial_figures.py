from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
HEADER = ROOT / "src" / "display" / "EditorialFigures.h"

def test_weather_engraving_is_one_bit_and_within_its_cell():
    compiler = shutil.which("g++") or shutil.which("clang++")
    assert compiler and HEADER.exists()
    source = r"""
#include "EditorialFigures.h"
#include <cassert>
struct MockCanvas {
  int x0=0, y0=0, x1=124, y1=86;
  bool outside=false;
  int count=0;
  void point(int x, int y) {
    if (x<x0 || x>x1 || y<y0 || y>y1) outside=true;
  }
  void drawLine(int a,int b,int c,int d,unsigned short color) {
    assert(color==1);
    point(a,b); point(c,d); count++;
  }
  void drawCircle(int x,int y,int r,unsigned short color) {
    assert(color==1);
    point(x-r,y-r); point(x+r,y+r); count++;
  }
};
int main() {
  for(int wmo: {0,2,3,51,71,95}) {
    MockCanvas d;
    EditorialFigures::weatherLandscape(d,0,0,124,86,wmo,1);
    assert(d.count>=6 && !d.outside);
  }
  return 0;
}
"""
    source=source.replace('#include <cassert>', '#include <cassert>\n#include <initializer_list>')
    with tempfile.TemporaryDirectory() as temp:
        file=Path(temp)/"figure.cpp";out=Path(temp)/"figure"
        file.write_text(source,encoding="utf-8")
        subprocess.run([compiler,"-std=c++11","-Wall","-Wextra","-Werror",
                        "-I",str(HEADER.parent),str(file),"-o",str(out)],
                       check=True,capture_output=True,text=True)
        subprocess.run([str(out)],check=True,capture_output=True,text=True)
