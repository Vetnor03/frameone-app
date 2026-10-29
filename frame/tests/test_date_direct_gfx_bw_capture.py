"""Direct native Date -> original upstream Adafruit_GFX -> GxEPD2 BW.

A deliberate mismatch with the former homegrown 1-bit raster is reported,
NOT passed off as pixel equivalence or a physical e-paper approval.
"""
import hashlib
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/"frame/tools"))
from generate_date_direct_gfx_bw_capture import generate, checked_blob, ADAFRUIT_FILES

def test_original_upstream_gfx_blobs_are_pinned():
    for file,sha in ADAFRUIT_FILES.items():
        data=checked_blob(file,sha)
        assert hashlib.sha1(b"blob "+str(len(data)).encode()+b"\0"+data).hexdigest()==sha

def test_native_date_paint_direct_through_actual_gfx_and_bw(tmp_path):
    report=generate(tmp_path/"real")
    assert report["actualProductionDateCpp"] is True
    assert report["actualAdafruitGFXCpp"] is True
    assert report["actualGxEPD2BWHeader"] is True
    assert report["realSPI"] is report["realPanel"] is False
    assert report["flashed"] is False
    assert len(report["cases"])==5
    assert all(c["admitted"] and c["inkInside"]>=300 and
               c["outOfCell"]==0 and c["outsideMatte"]==0
               for c in report["cases"])
    assert all(c["fullWrites"]==c["refreshes"]==1 for c in report["cases"])
    for case in report["cases"]:
        path=tmp_path/"real"/case["file"]
        assert len(path.read_bytes())==48000
        assert hashlib.sha256(path.read_bytes()).hexdigest()==case["sha256"]
        assert case["mismatchBits"]>=0
