from pathlib import Path


HEADER = (Path(__file__).parents[1] / "src" / "core" / "SmartRefresh.h").read_text()


def test_smart_refresh_state_storage_stays_off_loop_task_stack():
    assert "HeapBackedArray<SmartModuleState, MAX_GRID_CELLS> modules;" in HEADER
    assert "HeapBackedArray<Cell, MAX_GRID_CELLS> regions;" in HEADER
    assert "HeapBackedArray<bool, MAX_GRID_CELLS> dirty;" in HEADER

    assert "SmartModuleState modules[MAX_GRID_CELLS]" not in HEADER
    assert "Cell regions[MAX_GRID_CELLS]" not in HEADER
    assert "bool dirty[MAX_GRID_CELLS]" not in HEADER


def test_smart_refresh_stack_size_guards_are_present():
    assert 'static_assert(sizeof(SmartRenderState) <= 64' in HEADER
    assert 'static_assert(sizeof(SmartDisplayPlan) <= 64' in HEADER
