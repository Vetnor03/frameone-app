"""Use the ACTUAL pinned GxEPD2_BW template, mocked only at host boundary.

This is a more direct execution proof than a local source-like packing mirror.
The Adafruit_GFX renderer, SPI, real 750_T7 and panel are still untested.
"""
import hashlib
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/"frame/tools"))
from generate_date_real_gxepd_bw_capture import generate, pinned_header_bytes, PINNED_GIT_BLOB_SHA1


def test_pinned_upstream_git_object_is_exact():
    src=pinned_header_bytes()
    assert b"class GxEPD2_BW" in src
    assert b"void drawPixel(" in src
    assert b"bool nextPage()" in src
    assert hashlib.sha1(b"blob "+str(len(src)).encode()+b"\0"+src).hexdigest()==PINNED_GIT_BLOB_SHA1


def test_real_upstream_gxepd2_template_consumes_original_date_host_pixels(tmp_path):
    manifest=generate(tmp_path/"real-bw")
    assert manifest["actualGxEPD2BWClassExecuted"] is True
    assert manifest["actualAdafruitGFXClassExecuted"] is False
    assert manifest["actualT7PanelClassExecuted"] is False
    assert manifest["actualSPIOrPhysicalDisplay"] is False
    assert manifest["flashed"] is False
    assert len(manifest["cases"])==5
    assert all(case["admitted"] for case in manifest["cases"])
    for case in manifest["cases"]:
        stream=(tmp_path/"real-bw"/case["outputFile"]).read_bytes()
        assert len(stream)==48000
        assert hashlib.sha256(stream).hexdigest()==case["sha256"]
        assert case["byteMismatches"]==0
        assert case["realGxEPD2BWClassExecuted"] is True
        assert case["fullWrites"]==case["refreshes"]==1
        assert case["repeatWrites"]==case["powerOffs"]==1
