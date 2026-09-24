from pathlib import Path

ROOT = Path(__file__).parents[2]
SKI = (ROOT / "frame" / "src" / "modules" / "ModuleSki.cpp").read_text()
RENDERER = (ROOT / "frame" / "src" / "modules" / "ModuleRenderer.cpp").read_text()
CAPABILITY = (ROOT / "frame" / "src" / "modules" / "AdaptiveModuleCapability.h").read_text()
SKETCH = (ROOT / "frame" / "src" / "frame_v2.5.1.ino").read_text()
REGISTRY = (ROOT / "shared" / "frame-modules.json").read_text()
SKI_ROUTE = (ROOT / "app" / "api" / "device" / "ski-frame" / "route.ts").read_text()


def test_ski_is_a_full_physical_module_not_2x2_only():
    assert '"id": "ski"' in REGISTRY
    assert 'numericInstance(module, "ski", 4)' in CAPABILITY
    assert 'numericInstance(mod.c_str(), "ski", 4)' in RENDERER
    assert "cell.size == CELL_MEDIUM" not in RENDERER
    assert "isReference2x2" not in SKI
    assert "drawShallow" in SKI
    assert "drawNarrow" in SKI
    assert "drawExpanded" in SKI


def test_ski_uses_multi_hour_cache_and_extended_conditions():
    assert "3UL * 60UL * 60UL * 1000UL" in SKI
    assert 'doc["resort"]' in SKI
    assert 'doc["next_powder_day"]' in SKI
    assert "Next powder" in SKI
    assert "Neste pudderdag" in SKI


def test_ski_device_adapter_exposes_resort_powder_and_language():
    assert "language," in SKI_ROUTE
    assert "resort_open" in SKI_ROUTE
    assert "lifts_open" in SKI_ROUTE
    assert "next_powder_day" in SKI_ROUTE
    assert "display_date" in SKI_ROUTE


def test_ski_work_keeps_locked_firmware_label():
    assert 'static const char* FW_VER = "v2.7.2";' in SKETCH
