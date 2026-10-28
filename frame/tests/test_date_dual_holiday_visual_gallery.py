"""Source bitmap visual review: actually shows dual-month and holidays.

Not a hardware framebuffer; no production app, Surf or device code imported.
"""
from pathlib import Path
import json
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[2]
SCRIPT=ROOT/"frame/tools/generate_date_dual_holiday_gallery.py"

def test_seven_source_bitmap_cases_and_factual_fallbacks(tmp_path):
    output=tmp_path/"dual.html"
    r=subprocess.run([sys.executable,str(SCRIPT),"--output",str(output)],
                     cwd=ROOT,capture_output=True,text=True,timeout=85)
    assert r.returncode==0,r.stderr
    stat=json.loads(r.stdout)
    assert stat["total"]==7
    assert stat["admitted"]>=3,stat
    assert stat["holidaysRendered"]>=1,stat
    assert stat["yearRollover"]>=1,stat
    assert stat["fallback"]>=2,stat
    doc=output.read_text(encoding="utf-8")
    assert doc.count('<article>')==7
    assert doc.count('<svg viewBox="0 0 800 480"')==7
    assert "Legacy fallback — no candidate drawn" in doc
    # Exactly the two calendar-only scenarios may use optional native art.
    # One/two dated holiday rows REPLACE the illustration, never overlap it.
    assert doc.count('data-botanical="native-line-ink-v1"')==2
    assert '<body class="hide">' in doc  # clean view; guides are opt-in
    assert "NOT A FRAME CAPTURE" in doc
    assert "dual calendar and holiday" in doc.lower()
    assert "src=\"http" not in doc

def test_report_is_not_live_or_deployable():
    body=SCRIPT.read_text()
    workflow=(ROOT/".github/workflows/frame-firmware-build.yml").read_text()
    assert "generate_date_review_gallery" in body
    assert "date_editorial_svg" in body
    assert "DateEditorialF2Adapter" not in body
    assert "date-vnext-dual-holiday-review-unflashed" in workflow
    assert "ModuleSurf" not in body
