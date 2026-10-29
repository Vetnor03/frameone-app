"""Original Date+News full-800x480 GFX/BW compositions with synthetic feed.

Mirror left/right, light/dark and October/December rollover. The old 680x436
matte is NOT the current runtime viewport and is not a QA pass/fail bound.
"""
import hashlib
import json
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/"frame/tools"))
from generate_date_news_real_gfx_bw import generate


def test_real_date_news_modules_full_panel_both_sides_and_rollover(tmp_path):
    out=tmp_path/"real-news"
    report=generate(out)
    assert report["dateProductionCpp"]
    assert report["newsProductionCpp"]
    assert report["originalAdafruitGFX"]
    assert report["originalGxEPD2BW"]
    assert report["syntheticOfflineHeadlines"] is True
    assert report["realBackend"] is False
    assert report["realSPI"] is report["physicalPanel"] is False
    assert report["flashed"] is False
    assert report["fullPanelViewport"]==[0,0,800,480]
    assert len(report["cases"])==8
    assert {c["theme"] for c in report["cases"]}=={"light","dark"}
    assert {c["newsPosition"] for c in report["cases"]}=={"left","right"}
    assert {c["dateScenario"] for c in report["cases"]}=={"october","rollover"}
    assert len({(c["theme"],c["newsPosition"],c["dateScenario"])
                for c in report["cases"]})==8
    for item in report["cases"]:
        assert item["realModuleDateCpp"] and item["realModuleNewsCpp"]
        assert item["dateEditorialAdmitted"]
        assert item["fullPanelViewport"]==[0,0,800,480]
        assert item["dateInk"]>300 and item["newsInk"]>30
        assert item["outOfAssignedCells"]==0
        assert item["newsInkInsideDate"]==item["dateInkInsideNews"]==0
        assert item["totalFullPanelInk"]==item["dateInk"]+item["newsInk"]
        assert item["dateThenNewsVsIndependentBits"]==0
        assert item["newsThenDateVsIndependentBits"]==0
        assert item["newsSide"]==item["newsPosition"]
        assert item["dateCellX"]==(200 if item["newsPosition"]=="left" else 0)
        assert item["newsCellX"]==(0 if item["newsPosition"]=="left" else 600)
        data=(out/item["outputBin"]).read_bytes()
        assert len(data)==48000
        assert hashlib.sha256(data).hexdigest()==item["sha256"]
        png=(out/item["outputPng"]).read_bytes()
        assert png.startswith(b"\x89PNG\r\n\x1a\n")
        assert int.from_bytes(png[16:20],"big")==800
        assert int.from_bytes(png[20:24],"big")==480
    saved=json.loads((out/"manifest.json").read_text())
    assert saved==report
