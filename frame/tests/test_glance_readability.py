"""Static guardrails for frame text readability (no display hardware needed)."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1] / "src" / "modules"


def module(name: str) -> str:
    return (ROOT / name).read_text(encoding="utf-8")


def test_reminders_use_readable_body_in_anchor_and_adaptive_layouts():
    source = module("ModuleReminders.cpp")
    assert "REMINDER_CONTENT_FONT = FONT_12" in source
    assert "#include \"FreeSans12ptNO.h\"" in source
    assert "return {REMINDER_CONTENT_FONT, 112, 8, 68}" in source
    assert "const int lineStep = smartLineStep(REMINDER_CONTENT_FONT)" in source
    assert "drawLeft(titleRect.x - x1, baseline, lines[line], REMINDER_CONTENT_FONT" in source
    assert "{FONT_B9,88,5,48}" not in source
    assert "Exceptionally long titles must not make the entire module blank" in source


def test_news_headlines_take_priority_over_density():
    source = module("ModuleNews.cpp")
    assert "#define NEWS_FONT_BODY (&FreeSansBold12pt8b)" in source
    assert "#define NEWS_FONT_HEADER (&FreeSans9pt8b)" in source
    assert "const int lineStep = 29" in source
    assert "if (c.size == CELL_XL) return 7" in source
    assert "drawNewsTeaser(c, contentTop, contentH)" in source


def test_weather_temperature_is_primary_in_small_and_medium_views():
    source = module("ModuleWeather.cpp")
    compact = source.split("static void renderSmall(", 1)[1].split("static void renderMedium(", 1)[0]
    medium = source.split("static void renderMedium(", 1)[1].split("static void renderMiniDay(", 1)[0]
    assert "temperature, FONT_B18" in compact
    assert "tomorrow ? data.days[1].hiC : data.tempC" in compact
    assert "summary, FONT_B12" in compact
    assert "drawLeft(tx, tempBaseline, loBuf, FONT_B18" in medium
    assert "drawLeft(tx, tempBaseline, hiBuf, FONT_B18" in medium
