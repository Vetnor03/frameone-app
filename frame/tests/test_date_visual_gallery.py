"""Offline image QA fixture: actual 1-bit bitmap source, 16 grid sizes, all 100 placements.

The HTML is a *simulation*, never a captured GxEPD2 screenshot.
"""
from pathlib import Path
import json
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[2]
SCRIPT=ROOT/"frame/tools/generate_date_review_gallery.py"

def test_gallery_uses_exact_f1_freesans_bitmap_and_all_grid_fixtures(tmp_path):
    output=tmp_path/"date-vnext-review.html"
    res=subprocess.run([sys.executable,str(SCRIPT),"--output",str(output)],
                       cwd=ROOT,text=True,capture_output=True,timeout=80)
    assert res.returncode==0,res.stderr
    count=json.loads(res.stdout)
    assert count["total"]==116
    assert count["shapes"]==16
    assert count["placements"]==100
    assert count["fullCore"]>0
    assert count["editorialCandidates"]>0
    assert "FULL EDITORIAL DATE + CALENDAR + ART CONCEPT" in output.read_text(encoding="utf-8")
    assert 'stroke="#292929" stroke-width="1.2"' in report  # visible today ring
    report=output.read_text(encoding="utf-8")
    assert report.count('<article class="tile"')==116
    assert report.count('data-kind="size"')==16
    assert report.count('data-kind="placement"')==100
    assert report.count('<svg viewBox="0 0 800 480"')==116
    assert report.count('x="58" y="39" width="680" height="436"')>=116
    assert 'ORIGINAL F1' not in report or 'original F1 pixel-font' in report
    assert "NOT APPROVED FRAME OUTPUT" in report
    assert "NOT" in report and "GxEPD2" in report
    assert "No Surf or other module content is simulated" in report
    assert '<path fill="#191919"' in report  # real Fraunces/DM bit runs
    assert "src=\"http" not in report
    assert "href=\"http" not in report

def test_report_not_deployed_or_surf_mutating():
    script=SCRIPT.read_text(encoding="utf-8")
    workflow=(ROOT/".github/workflows/frame-firmware-build.yml").read_text()
    assert "RemindEditorialFonts.cpp" in script
    assert "FreeSans9ptNO.h" in script
    assert "FreeSansBold12ptNO.h" in script
    assert "date-visual-review:" in workflow
    assert "upload-artifact@v4" in workflow
    assert "date-vnext-original-gfx-visual-review-unflashed" in workflow
    assert "ModuleSurf" not in script
    assert "src/modules/ModuleDate.cpp" not in script
