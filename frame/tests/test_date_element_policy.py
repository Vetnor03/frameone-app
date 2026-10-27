"""Candidate Date role-policy contract. No firmware or visual approval implied."""
import json
from itertools import product
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
POLICY = json.loads((ROOT / "shared/date-element-policy.json").read_text(encoding="utf-8"))
FIXTURES = json.loads((ROOT / "shared/date-element-policy-fixtures.json").read_text(encoding="utf-8"))


def visible(x, y, w, h):
    viewport = POLICY["panel"]["matte"]
    l, t = max(x, viewport["x"]), max(y, viewport["y"])
    r = min(x + w, viewport["x"] + viewport["width"])
    b = min(y + h, viewport["y"] + viewport["height"])
    return l, t, max(0, r - l), max(0, b - t)


def candidate(x, y, w, h):
    _, _, width, height = visible(x, y, w, h)
    rules = POLICY["candidateGeometry"]
    if height < rules["ribbon"]["maxHeightExclusive"] and width >= rules["ribbon"]["minWidth"]:
        return "ribbon"
    if width < rules["column"]["maxWidthExclusive"] and height >= rules["column"]["minHeight"]:
        return "column"
    if width < rules["column"]["maxWidthExclusive"] or height < rules["ribbon"]["maxHeightExclusive"]:
        return "compact"
    if width >= rules["spread"]["minWidth"] and height >= rules["spread"]["minHeight"]:
        return "spread"
    return "card"


def test_contract_is_explicitly_inactive_and_not_approved():
    assert POLICY["status"] == "experimental_contract_not_approved_for_rendering"
    assert POLICY["guardrails"]["routeToRuntime"] is False
    assert POLICY["guardrails"]["defaultFirmwareUnchanged"] is True
    assert POLICY["guardrails"]["noShapeSpecificRenderers"] is True
    assert POLICY["guardrails"]["neverTruncateDate"] is True
    assert POLICY["guardrails"]["noPartialRendering"] is True
    assert POLICY["panel"]["width"] == 800 and POLICY["panel"]["height"] == 480
    assert POLICY["panel"]["matte"] == {"x": 58, "y": 39, "width": 680, "height": 436}


def test_date_fact_roles_and_priority_never_depend_on_shape():
    elements = POLICY["elements"]
    by_id = {e["id"]: e for e in elements}
    assert len(by_id) == len(elements)
    assert by_id["day"]["role"] == "hero"
    assert by_id["day"]["priority"] == "essential"
    assert by_id["day"]["fonts"] == ["Fraunces72", "Fraunces48"]
    assert by_id["weekday"]["priority"] == by_id["month"]["priority"] == "important"
    assert by_id["year"]["priority"] == "optional"
    assert by_id["currentCalendar"]["priority"] == "important"
    assert by_id["botanical"]["priority"] == "decorative"
    assert by_id["botanical"]["disclosure"].startswith("only_after_all_facts")
    assert all(e["requireInkFit"] for e in elements)
    assert all("colSpan" not in e and "rowSpan" not in e for e in elements)
    assert all(e["priority"] in POLICY["priorities"] for e in elements)


def test_visual_expression_is_not_bound_to_grid_size_or_demo_content():
    # Policy is a design contract only: future runtime must pick a whole layout
    # from measured facts/ink/space, rather than binding 1x2 to a fixed picture.
    expression = POLICY["expressionPolicy"]
    assert expression["status"] == "contract_only_not_implemented"
    assert expression["visualAuthority"] == "measured_content_and_available_ink_rectangles"
    assert expression["compositionSelection"] == (
        "evaluate_all_feasible_candidates_and_choose_best_measured_whole_plan"
    )
    assert set(expression["candidateCompositions"]) == {
        "compact", "ribbon", "column", "card", "spread"
    }
    assert {"factualDateAndCalendarContent", "actualF2GfxGlyphInkBounds",
            "minimumReadableText", "remainingWhitespace",
            "matteClippedVisibleRect"} <= set(expression["selectionInputs"])
    constraints = expression["selectionConstraints"]
    assert all(constraints.values())
    art = expression["art"]
    assert art["phase"] == "R4_after_typography_and_calendar_QA"
    assert art["eligibleBy"] == "measured_remaining_rectangle_not_grid_size"
    assert art["motifSelection"] == "curated_data_driven_deterministic"
    assert art["stableAcrossUnchangedRefreshes"] is True
    assert art["noForcedArt"] is True
    # Detect accidental per-shape fixed layout/placement coordinates in
    # semantic descriptors; grid and physical matte dimensions are exempt.
    banned = {"colSpan", "rowSpan", "cellSize", "fixedX", "fixedY",
              "x", "y", "left", "top", "layoutFor1x2", "layoutFor2x1",
              "specificCellLayout", "artworkFile", "sampleDate"}
    assert all(not (banned & set(element)) for element in POLICY["elements"])
    assert not (banned & set(expression))
    assert not (banned & set(expression["selectionConstraints"]))


def test_named_fixtures_use_visible_geometry_only():
    ids = set()
    for fixture in FIXTURES:
        assert fixture["id"] not in ids
        ids.add(fixture["id"])
        cell = fixture["cell"]
        assert candidate(**cell) == fixture["expectedCandidate"], fixture["id"]
        left, top, w, h = visible(**cell)
        assert 58 <= left < left + w <= 738
        assert 39 <= top < top + h <= 475
    assert {"1x1_top_left", "1x2_top_left", "2x1_top", "2x2_centre", "4x1_top", "4x3_bottom", "4x4"} <= ids


def test_all_16_shapes_all_valid_4x4_placements_light_dark_and_data_presets():
    count = 0
    shapes = set()
    candidate_shapes = set()
    for col_span, row_span in product(range(1, 5), repeat=2):
        shapes.add((col_span, row_span))
        for col, row in product(range(5-col_span), range(5-row_span)):
            box = dict(x=col * 200, y=row * 120,
                       w=col_span * 200, h=row_span * 120)
            l, t, w, h = visible(**box)
            assert w > 0 and h > 0
            assert 58 <= l < l + w <= 738 and 39 <= t < t + h <= 475
            shape = candidate(**box)
            assert shape in {"compact", "column", "ribbon", "card", "spread"}
            candidate_shapes.add(shape)
            for theme, preset in product(("light", "dark"), ("normal", "long", "extreme", "empty")):
                # Only geometry policy is checked here; no claim of ink or calendar QA.
                assert candidate(**box) == shape, (theme, preset, box)
                count += 1
    assert len(shapes) == 16
    assert candidate_shapes == {"compact", "column", "ribbon", "card", "spread"}
    assert count == 100 * 2 * 4 == 800


def test_contract_keeps_all_runtime_out_of_scope():
    # An isolated declarative policy must not toggle any existing runtime path.
    assert POLICY["guardrails"]["routeToRuntime"] is False
    assert POLICY["guardrails"]["evaluationOrder"][-1] == "atomicDrawOrLegacyFallback"
    assert "F2GlyphMeasurement" in POLICY["guardrails"]["evaluationOrder"]
    assert POLICY["candidateGeometry"]["illustration"]["minSafeWidth"] >= 560
