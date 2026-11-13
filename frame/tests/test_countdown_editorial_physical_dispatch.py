"""Countdown physical V4 preview must cover legacy anchors as well as adaptive cells.

The R3 native QA renders every pixel geometry by calling the opt-in C++
entry point directly. This regression checks that the actual module dispatch
also calls that renderer for 4x1, 2x2, 4x2 and 4x4, without changing normal
production builds or any legacy renderer.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_editorial_countdown_precedes_all_size_dispatch():
    source = (ROOT / "src/modules/ModuleCountdown.cpp").read_text()
    start = source.index("void render(const Cell& c, const String& moduleName)")
    dispatch = source[start: source.index("} // namespace ModuleCountdown", start)]
    opt_in = "#if REMIND_COUNTDOWN_EDITORIAL_PREVIEW_ENABLED"
    preview = "if (renderEditorialCountdownPreview(c)) return;"
    assert dispatch.count(opt_in) == 1
    assert dispatch.count(preview) == 1
    assert dispatch.index("ensureLoaded();") < dispatch.index(opt_in)
    assert dispatch.index(opt_in) < dispatch.index("if (c.size == CELL_ADAPTIVE)")
    for anchor, fn in [
        ("CELL_SMALL", "renderSmall"),
        ("CELL_MEDIUM", "renderMedium"),
        ("CELL_LARGE", "renderLarge"),
        ("CELL_XL", "renderXL"),
    ]:
        assert f"if (c.size == {anchor})" in dispatch
        assert f"{fn}(c);" in dispatch
        assert dispatch.index(preview) < dispatch.index(f"if (c.size == {anchor})")

    # Compiler default remains OFF; only the isolated test environment enables.
    assert "#define REMIND_COUNTDOWN_EDITORIAL_PREVIEW_ENABLED 0" in source
    ini = (ROOT / "platformio.ini").read_text()
    isolated = ini.split("[env:alfred_v1_2_countdown_r2_preview]", 1)[1]
    assert "-DREMIND_COUNTDOWN_EDITORIAL_PREVIEW_ENABLED=1" in isolated
    standard = ini.split("[env:alfred_v1_2]", 1)[1].split("[env:", 1)[0]
    assert "REMIND_COUNTDOWN_EDITORIAL_PREVIEW_ENABLED" not in standard
