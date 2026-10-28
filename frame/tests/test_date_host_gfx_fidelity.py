"""Pinned Adafruit_GFX 1.12.6 filled-circle geometry reference.

GxEPD2_BW 1.6.4 inherits Adafruit_GFX. This is host raster parity,
not proof of the real GxEPD2 paged buffer or panel response.
"""
import subprocess
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
HOST=ROOT/"frame/tests/native_capture"
RADII=(0,1,2,3,7,11,16,30)


def reference_mask(r):
    # Independent test oracle transcribed from Adafruit_GFX v1.12.6
    # fillCircle + fillCircleHelper(corners=3,delta=0).
    pixels=set()

    def vertical(x,y,h):
        pixels.update((x, yy) for yy in range(y,y+h))

    vertical(0,-r,2*r+1)
    f,ddx,ddy,x,y,px,py=1-r,1,-2*r,0,r,0,r
    while x<y:
        if f>=0:
            y-=1
            ddy+=2
            f+=ddy
        x+=1
        ddx+=2
        f+=ddx
        if x<y+1:
            vertical(x,-y,2*y+1)
            vertical(-x,-y,2*y+1)
        if y!=py:
            vertical(py,-px,2*px+1)
            vertical(-py,-px,2*px+1)
            py=y
        px=x
    return ["".join("1" if (x,y) in pixels else "0"
                    for x in range(-r,r+1))
            for y in range(-r,r+1)]


def test_host_circle_matches_pinned_adafruit_gfx_reference(tmp_path):
    binary=tmp_path/"gfx_circle_probe"
    compile_result=subprocess.run([
        "g++","-std=c++11","-Wall","-Wextra","-Werror","-pedantic",
        "-I",str(HOST/"include"),"-I",str(HOST),
        str(HOST/"gfx_circle_compat_cli.cpp"),"-o",str(binary)
    ],cwd=ROOT,text=True,capture_output=True,timeout=45)
    assert compile_result.returncode==0,compile_result.stderr
    run=subprocess.run([str(binary)],cwd=ROOT,text=True,
                       capture_output=True,timeout=15)
    assert run.returncode==0,run.stderr
    lines=iter(run.stdout.splitlines())
    for r in RADII:
        assert next(lines)=="radius="+str(r)
        actual=[next(lines) for _ in range(2*r+1)]
        assert actual==reference_mask(r),f"Upstream GFX fillCircle divergence r={r}"
    assert list(lines)==[]
    # Guard against reverting to the previous mathematically filled disc.
    assert reference_mask(2)!=[
        "".join("1" if x*x+y*y<=4 else "0" for x in range(-2,3))
        for y in range(-2,3)
    ]


def test_host_raster_change_is_isolated_from_firmware():
    source=(HOST/"CaptureFrameDisplay.h").read_text()
    assert "Adafruit_GFX 1.12.6" in source
    assert "fillCircleHelper" in source
    assert "x*x+y*y<=r*r" not in source
    assert "frame/src" not in str(HOST/"gfx_circle_compat_cli.cpp")
