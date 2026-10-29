"""Original Date+News full-page GFX/BW composition with synthetic News feed."""
import hashlib
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/"frame/tools"))
from generate_date_news_real_gfx_bw import generate

def test_real_date_news_modules_share_exact_gfx_framebuffer(tmp_path):
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
    assert len(report["cases"])==2
    for item in report["cases"]:
        assert item["realModuleDateCpp"] and item["realModuleNewsCpp"]
        assert item["dateEditorialAdmitted"]
        assert item["dateInk"]>300 and item["newsInk"]>30
        assert item["newsInkInsideDate"]==item["dateInkInsideNews"]==0
        assert item["dateThenNewsVsIndependentBits"]==0
        assert item["newsThenDateVsIndependentBits"]==0
        data=(out/item["outputBin"]).read_bytes()
        assert len(data)==48000
        assert hashlib.sha256(data).hexdigest()==item["sha256"]
        assert (out/item["outputPng"]).read_bytes().startswith(b"\x89PNG\r\n\x1a\n")
