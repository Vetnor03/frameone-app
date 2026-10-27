"""Role-first Date planner parity: one policy source, JS/C++ whole-plan geometry.

Both implementations are isolated and NOT linked into production display code.
Metrics here are synthetic bounding-box fixtures, NOT GFX font raster validation.
"""
from itertools import product
from pathlib import Path
import json
import subprocess

ROOT = Path(__file__).resolve().parents[2]
HELPERS = ROOT / "frame/tests/helpers"
POLICY = json.loads((ROOT / "shared/date-element-policy.json").read_text(encoding="utf-8"))

# day width/height, month width/height, weekday width/height
METRICS = {
    "normal": (60, 60, 105, 24, 115, 24),
    "long": (90, 68, 165, 24, 150, 24),
    "small": (40, 44, 70, 18, 76, 18),
    "extreme": (124, 78, 185, 32, 175, 32),
}


def inputs():
    cases = []
    for cw, rh in product(range(1, 5), repeat=2):
        for col, row in product(range(5 - cw), range(5 - rh)):
            for name, metrics in METRICS.items():
                cases.append(((col * 200, row * 120, cw * 200, rh * 120, *metrics),
                              (cw, rh, col, row, name)))
    # Explicit invalid/empty cases must yield safe fallback.
    for shape in ((0, 0, 0, 0), (800, 500, 200, 120),
                  (0, 0, 200, 120), (200, 120, 400, 240)):
        cases.append(((*shape, 0, 0, 80, 18, 95, 18), ("invalid", shape)))
    return cases


def invoke(command, cases):
    text = "".join(" ".join(str(n) for n in numeric) + "\n" for numeric, _ in cases)
    p = subprocess.run(command, input=text, text=True, capture_output=True,
                       check=True, timeout=50, cwd=ROOT)
    results = p.stdout.splitlines()
    assert len(results) == len(cases), (len(results), len(cases), p.stderr)
    return results


def unpack(result):
    if result == "fallback":
        return None
    parts = result.split("|")
    assert len(parts) == 6, result
    assert parts[0] in {"stack", "ribbon", "card"}
    boxes = [tuple(int(n) for n in part.split(",")) for part in parts[1:]]
    assert all(len(box) == 4 for box in boxes)
    return parts[0], boxes


def within(inner, outer):
    x, y, w, h = inner
    ox, oy, ow, oh = outer
    return w > 0 and h > 0 and ox <= x < x + w <= ox + ow and oy <= y < y + h <= oy + oh


def overlaps(a, b):
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    return min(ax + aw, bx + bw) > max(ax, bx) and min(ay + ah, by + bh) > max(ay, by)


def test_generated_bindings_are_fresh_and_source_is_shared():
    assert POLICY["measuredPlanner"]["status"] == "geometry_only_unwired_prototype"
    assert POLICY["measuredPlanner"]["noDirectSpanBranch"]
    assert POLICY["measuredPlanner"]["candidateExpressions"] == ["stack", "ribbon", "card"]
    subprocess.run(["python3", "shared/generate_date_role_bindings.py", "--check"],
                   check=True, cwd=ROOT, capture_output=True, text=True, timeout=8)
    js = (ROOT / "app/lib/dateRolePlanner.mjs").read_text(encoding="utf-8")
    cpp = (ROOT / "frame/src/display/DateRolePlanner.h").read_text(encoding="utf-8")
    assert "colSpan" not in js and "rowSpan" not in js
    assert "colSpan" not in cpp and "rowSpan" not in cpp
    assert "dateRolePolicy.generated.mjs" in js
    assert "DateRolePolicy.generated.h" in cpp
    assert "setFont(" not in cpp and "draw" not in cpp


def test_measured_planner_js_cpp_parity_100_grid_positions_all_date_metrics(tmp_path):
    binary = tmp_path / "date_cpp_parity"
    subprocess.run(
        ["g++", "-std=c++11", "-Wall", "-Wextra", "-pedantic", "-Werror",
         "-I", str(ROOT / "frame/src/display"),
         str(HELPERS / "date_policy_cpp_cli.cpp"), "-o", str(binary)],
        check=True, cwd=ROOT, capture_output=True, text=True, timeout=30)
    cases = inputs()
    # 100 valid start-position/shape combinations × four metric variants.
    assert len(cases) == 404
    js = invoke(["node", str(HELPERS / "date_policy_js_cli.mjs")], cases)
    cpp = invoke([str(binary)], cases)
    assert js == cpp, next(((i, c, j, k) for i, (c, j, k)
                           in enumerate(zip(cases, js, cpp)) if j != k), None)

    modes = set()
    n_fallback = 0
    for (numbers, tag), output in zip(cases, js):
        parsed = unpack(output)
        if parsed is None:
            n_fallback += 1
            continue
        mode, [visible, group, month, day, weekday] = parsed
        modes.add(mode)
        assert within(group, visible), tag
        assert all(within(box, group) for box in (month, day, weekday)), tag
        assert all(not overlaps(a, b) for a, b in (
            (month, day), (day, weekday), (month, weekday))), tag
        assert within(visible, (58, 39, 680, 436)), tag
    assert modes == {"stack", "ribbon", "card"}, modes
    assert n_fallback > 0
    assert all(value == "fallback" for value in js[-4:])

    # Regression: same cell and position, different measured facts, different
    # valid visual expression. Never bind style to nominal grid shape.
    probe = [(item, output) for item, output in zip(cases, js)
             if item[1][:4] == (2, 2, 1, 1)]
    probe_modes = {tag[4]: unpack(output)[0] if unpack(output) else "fallback"
                   for (_, tag), output in probe}
    assert len(set(probe_modes.values()) - {"fallback"}) >= 2, probe_modes
