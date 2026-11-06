from pathlib import Path

SRC = Path(__file__).parents[1] / "src" / "modules" / "ModuleWeather.cpp"
ART = Path(__file__).parents[1] / "src" / "display" / "WeatherEditorialIllustrations.h"

def test_weather_illustrations_are_decorative_and_scoped():
    src = SRC.read_text(encoding="utf-8")
    art = ART.read_text(encoding="utf-8")
    assert 'WeatherEditorialIllustrations.h' in src
    assert 'WeatherEditorialIllustrations::allowedForCell(c)' in src
    assert 'primaryWmo' in src
    assert 'primaryWind' in src
    assert 'c.colSpan==3 && (c.rowSpan==3 || c.rowSpan==4)' in art
    assert 'c.colSpan==4 && c.rowSpan>=2' in art
    assert 'clearMeadow' in art
    assert 'rainBranch' in art
    assert 'snowTwig' in art
    assert 'mistHills' in art
    assert 'windStem' in art
