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

def test_botanical_sprig_stays_inside_reserved_date_region():
    compiler = shutil.which("g++") or shutil.which("clang++")
    assert compiler and HEADER.exists()
    source = r"""
#include "EditorialFigures.h"
#include <cassert>
struct Canvas {
  int left=0, top=0, right=0, bottom=0, calls=0;
  bool out=false;
  void point(int x,int y) { if(x<left || x>right || y<top || y>bottom) out=true; }
  void drawLine(int x1,int y1,int x2,int y2,unsigned short ink) {
    assert(ink==1);point(x1,y1);point(x2,y2);++calls;
  }
};
int main(){
  for(int w=72;w<=180;w+=27) for(int h=60;h<=120;h+=15) {
    Canvas c; c.left=4;c.top=9;c.right=c.left+w-1;c.bottom=c.top+h-1;
    EditorialFigures::botanicalSprig(c,c.left,c.top,w,h,1);
    assert(c.calls>=10 && !c.out);
  }
  Canvas tiny; EditorialFigures::botanicalSprig(tiny,0,0,50,30,1);
  assert(tiny.calls==0);
  return 0;
}
"""
    with tempfile.TemporaryDirectory() as temp:
        src=Path(temp)/"botanical.cpp"; exe=Path(temp)/"botanical"
        src.write_text(source,encoding="utf-8")
        subprocess.run([compiler,"-std=c++11","-Wall","-Wextra","-Werror",
                        "-I",str(HEADER.parent),str(src),"-o",str(exe)],
                       check=True,capture_output=True,text=True)
        subprocess.run([str(exe)],check=True,capture_output=True,text=True)
