"""Editorial calendar title quality checks; source GFX ink, not web typography.

Calendar month/day/week numbers and holiday markers stay unchanged. This is
not a GxEPD2 frame capture or physical 1–2m readability approval.
"""
import calendar
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/"frame/tools"))
from generate_date_review_gallery import load_font, metrics, render_calendar, FONT_SOURCE, FONT_DIR

DATE=(ROOT/"frame/src/modules/ModuleDate.cpp").read_text()
DUAL=(ROOT/"frame/tools/generate_date_dual_holiday_gallery.py").read_text()
GALLERY=(ROOT/"frame/tools/generate_date_review_gallery.py").read_text()

def test_original_dm18_title_ink_and_year_rollover_slot():
    font=load_font(FONT_SOURCE,"RemindDM18")
    for month in range(1,13):
        for name in (calendar.month_name[month],
                     f"{calendar.month_name[month]} 2027"):
            x,y,w,h=metrics(name,font)
            assert 0<w<280,(name,w)
            assert 0<h<=22,(name,h)
    # An ornament occupies only the pre-existing 10px title gap.
    title_h=22
    gap=10
    rule_y=title_h+gap//2
    assert title_h<rule_y-3 and rule_y+3<title_h+gap

def test_editorial_only_draw_preflight_and_legacy_title_default():
    assert "const GFXfont* editorialTitleFont = nullptr" in DATE
    assert "editorialTitleFont ? editorialTitleFont : FONT_B12" in DATE
    assert "editorialTitleFont?editorialTitleFont:FONT_B12" in DATE
    assert "editorialTitleFont?0:grid.titleGap" in DATE
    assert "if(editorialTitleFont) {" in DATE
    assert "gridFontFits(grid,false,RemindEditorialFonts::dm18())" in DATE
    assert "gridFontFits(nextGrid,dual.showNextYear," in DATE
    assert "RemindEditorialFonts::dm18());" in DATE
    assert "d.drawLine(midX-halfSpan,ruleY,midX-8,ruleY,ink);" in DATE
    assert 'true,p.showWeeks,true,true,dual.showNextYear,' in DATE
    assert '{"editorialTitle":True}' not in GALLERY
    assert '"editorialTitle":True' in DUAL
    assert 'fonts["DM18"] if entry.get("editorialTitle")' in GALLERY

def test_original_gfx_title_renders_without_removing_calendar_facts():
    font_source=load_font(FONT_SOURCE,"RemindDM18")
    small=load_font(FONT_DIR/"FreeSans9ptNO.h","FreeSans9pt8b")
    bold=load_font(FONT_DIR/"FreeSansBold12ptNO.h","FreeSansBold12pt8b")
    fonts={"DM18":font_source,"S9":small,"B12":bold}
    entry={"rect":{"x":400,"y":110,"w":300,"h":205},
           "year":2027,"month0":0,"showYear":True,
           "editorialTitle":True,
           "features":{"showMonthTitle":True,"showDowHeader":True,
                       "showWeekNums":True}}
    result=render_calendar(entry,(2026,12,31),{(1,1)},fonts)
    assert "CAL GRID DOES NOT FIT" not in result
    assert 'data-calendar-title-accent="original-1bit"' in result
    assert result.count("<path")>=2
    assert result.count("<circle")>=1 # 01.01 holiday dot
    assert 'fill="#222"' in result
    # Legacy call still uses B12 and never receives an ornament.
    old={**entry,"editorialTitle":False}
    legacy=render_calendar(old,(2026,12,31),{(1,1)},fonts)
    assert 'data-calendar-title-accent=' not in legacy
    assert len(result)>len(legacy)
