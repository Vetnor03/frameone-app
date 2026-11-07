from pathlib import Path

SOURCE = Path(__file__).parents[1] / "src" / "modules" / "ModuleSurf.cpp"

def test_surf_adaptive_lock_preserves_legacy_anchors():
    text = SOURCE.read_text(encoding="utf-8")

    # The four existing anchor renderers remain independent and untouched.
    assert "if (c.size == CELL_SMALL)" in text
    assert "if (c.size == CELL_MEDIUM)" in text
    assert "if (c.size == CELL_LARGE)" in text
    assert "if (c.size == CELL_XL)" in text

    # Only CELL_ADAPTIVE enters the approved geometry bridge.
    assert "if (c.size == CELL_ADAPTIVE)" in text
    assert "renderAdaptiveSurf(c, data, composition, spot, wave);" in text

    # Physical R3 rules: 1x1 is intentionally minimal and narrow tall cells
    # cap daypart density rather than squeezing four columns.
    assert "if(c.colSpan==1 && c.rowSpan==1)" in text
    assert "const int maxDayparts = (w < 500) ? 2 : 4;" in text

    # Adaptive families derive from locked Small/Medium language.
    assert "renderAdaptiveSmallFamily" in text
    assert "renderAdaptiveMediumFamily" in text
