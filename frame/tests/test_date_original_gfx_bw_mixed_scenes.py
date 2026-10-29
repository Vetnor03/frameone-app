"""Real Adafruit GFX + GxEPD2 BW Date-only painting in 11 mixed grids.

No false claim about rendering Surf, Weather, News or legacy Date; no panel.
"""
import hashlib
import json
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/"frame/tools"))
from generate_date_mixed_original_gfx_bw import generate,compose_editorial
from generate_date_mixed_layout_review import scenarios


def test_independent_dark_light_composition_polarties():
    a=bytes([0xF0])*48000
    b=bytes([0x0F])*48000
    assert compose_editorial(False,[a,b])==bytes([0x00])*48000
    assert compose_editorial(True,[a,b])==bytes([0xFF])*48000
    assert compose_editorial(False,[])==bytes([0xFF])*48000
    assert compose_editorial(True,[])==bytes([0x00])*48000


def test_11_mixed_layouts_use_actual_cpp_gfx_bw_and_report_fallbacks(tmp_path):
    report=generate(tmp_path/"evidence")
    assert report["scenarioCount"]==len(scenarios())==11
    assert report["dateSlotCount"]==sum(
        c["module"]=="date" for s in scenarios() for c in s["cells"])
    assert report["dateSlotCount"]==17
    assert report["admittedDateSlots"]>=1
    assert report["omittedLegacyDateSlots"]>=1
    assert report["admittedDateSlots"]+report["omittedLegacyDateSlots"]==17
    assert report["sourceVsNativeAdmissionMismatches"]==0
    assert report["dateOnlyComposite"] is True
    assert report["realOtherModuleRenderersExecuted"] is False
    assert report["actualPhysicalPanel"] is False
    assert report["realSPI"] is False
    assert report["flashed"] is False
    for scene in report["scenarios"]:
        assert scene["outOfDateSlots"]==0
        assert scene["outOfMatte"]==0
        assert scene["originalGfxCombinedVsIndependentCompositionBitDifferences"]==0
        assert scene["actualOtherModuleRasterCaptured"] is False
        assert len(scene["dateSlots"])==scene["dates"]
        assert scene["actualDriverAdmitted"]==sum(
            slot["nativeCppAdmitted"] for slot in scene["dateSlots"])
        for item in scene["individualOriginalGfxComparisons"]:
            assert item["pixelDifferencesFromPriorHost"]>=0
        raw=(tmp_path/"evidence"/scene["sourceBin"]).read_bytes()
        assert len(raw)==48000
        assert hashlib.sha256(raw).hexdigest()==scene["sha256"]
        assert (tmp_path/"evidence"/scene["previewPng"]).read_bytes().startswith(
            b"\x89PNG\r\n\x1a\n")
    assert (tmp_path/"evidence"/"review.html").exists()
    assert json.loads((tmp_path/"evidence"/"manifest.json").read_text())==report
