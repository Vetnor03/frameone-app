from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RENDERER = (ROOT / "src" / "modules" / "ModuleRenderer.cpp").read_text(encoding="utf-8")
MODULES = (
    "ModuleDate", "ModuleAssistant", "ModuleWeather", "ModuleSurf",
    "ModuleSki", "ModuleReminders", "ModuleNews", "ModuleCountdown",
    "ModuleSoccer", "ModuleStocks", "ModuleGroceries",
)

def test_all_supported_modules_use_responsive_editorial_dispatch():
    assert "EditorialDesign::kindFor(mod.c_str())" in RENDERER
    assert "EditorialReferences::select(contentKind, c.colSpan, c.rowSpan)" in RENDERER
    assert "presentation == EditorialReferences::SURF_MEDIUM_REFERENCE" in RENDERER
    assert "? CELL_MEDIUM : CELL_ADAPTIVE;" in RENDERER
    for module in MODULES:
        assert f"{module}::render(editorialCell" in RENDERER
        assert f"{module}::render(c" not in RENDERER

def test_unknown_modules_do_not_get_forced_into_adaptive_mode():
    assert "!= EditorialDesign::UNKNOWN" in RENDERER
