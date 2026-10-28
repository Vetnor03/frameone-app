"""GxEPD2_BW-compatible source-packing parity, not hardware confirmation."""
import hashlib
import subprocess
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
HOST=ROOT/"frame/tests/native_capture"
sys.path.insert(0,str(ROOT/"frame/tools"))
from generate_date_gxepd_packed_evidence import generate, pack_independent_from_pgm


def test_known_bit_order_and_polarity_from_pinned_gxepd2(tmp_path):
    exe=tmp_path/"packed_sentinels"
    build=subprocess.run(["g++","-std=c++11","-Wall","-Wextra","-Werror",
         "-pedantic","-I",str(HOST/"include"),"-I",str(HOST),
         str(HOST/"gxepd_packed_sentinels.cpp"),"-o",str(exe)],
         cwd=ROOT,text=True,capture_output=True,timeout=45)
    assert build.returncode==0,build.stderr
    run=subprocess.run([str(exe)],cwd=ROOT,text=True,
                       capture_output=True,timeout=15)
    assert run.returncode==0,run.stderr
    assert "48000 bytes" in run.stdout


def test_independent_pack_byte_order_oracle():
    # 0 and 255 are PGM BLACK and WHITE; the packed bytes invert color
    # semantics (GxEPD2_BW: 1=WHITE). Check both ends and two scanlines.
    pixels=bytearray([255]*384000)
    for y,x in [(0,0),(0,7),(0,8),(0,799),(1,0)]:
        pixels[y*800+x]=0
    buf=pack_independent_from_pgm(b"P5\n800 480\n255\n"+pixels)
    assert len(buf)==48000
    assert [buf[i] for i in (0,1,99,100,101)]==[0x7E,0x7F,0xFE,0x7F,0xFF]


def test_real_native_date_draws_are_identical_to_independent_packed_oracle(tmp_path):
    report=generate(tmp_path/"packed")
    assert report["byteCount"]==48000
    assert report["pageHeight"]==480 and report["pageCount"]==1
    assert report["rotation"]==0
    assert report["actualGxEPD2Buffer"] is False
    assert report["realGxEPD2ClassExecuted"] is False
    assert len(report["cases"])==5
    assert sum(case["admitted"] for case in report["cases"])>=2
    assert all(case["mismatches"]==0 and
               case["independentlyCheckedBits"]==384000
               for case in report["cases"])
    for case in report["cases"]:
        buf=(tmp_path/"packed"/case["rawFile"]).read_bytes()
        assert len(buf)==48000
        assert hashlib.sha256(buf).hexdigest()==case["sha256"]
    assert len(set(case["sha256"] for case in report["cases"]))>1
