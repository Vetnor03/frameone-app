from pathlib import Path


def test_hourly_precipitation_replaces_daily_aggregate_before_accumulation():
    source = Path("frame/src/modules/ModuleWeather.cpp").read_text()
    reset = "if (!anyDay[di]) day.precipMm = 0.0f;"
    add = "day.precipMm += pr;"

    assert reset in source
    assert source.index(reset) < source.index(add, source.index(reset))

