"""Native C++ admission audit for every Date slot in mixed Layout Lab scenes."""
import json
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/"frame/tools"))
from audit_date_native_mixed_parity import generate
from generate_date_mixed_layout_review import scenarios


def test_all_mixed_date_slots_run_real_firmware_renderer(tmp_path):
    output=tmp_path/"native_mixed.json"
    report=generate(output)
    scenes=scenarios()
    assert report["sceneCount"]==len(scenes)==11
    assert report["dateSlotCount"]==sum(
        cell["module"]=="date" for s in scenes for cell in s["cells"])
    assert report["nativeSource"]=="frame/src/modules/ModuleDate.cpp"
    assert report["actualGxEPD2Buffer"] is False
    assert report["otherModuleRenderersCaptured"] is False
    assert report["flashed"] is False
    assert report["nativeEditorialAdmissions"]>=1
    assert all(r["nativePixelHash"] for r in report["cases"])
    assert all(r["nativeOutOfCell"]==0 and r["nativeOutOfMatte"]==0
               and r["nativeOutOfPanelAttempts"]==0
               for r in report["cases"] if r["nativeCppEditorialAdmitted"])
    assert len(report["admissionDifferences"])==sum(
        r["acceptanceDiffers"] for r in report["cases"])
    assert json.loads(output.read_text(encoding="utf-8"))==report
