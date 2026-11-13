"""News vNext R1 source-contract tests: visual isolation only."""
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
source=(ROOT/"src/modules/ModuleNews.cpp").read_text()
preview=(ROOT/"src/modules/NewsEditorialPreview.h").read_text()

def test_only_visual_opt_in():
    assert '#include "NewsEditorialPreview.h"' in source
    assert 'if (renderEditorialNewsPreview(c)) return;' in source
    render=source[source.index('void render(const Cell& c, const String&)'): ]
    assert render.index("if (renderEditorialNewsPreview(c)) return;") < render.index("if (shallowLayout(c)) renderShallow(c);")
    assert "else renderList(c);" in render

def test_original_news_functionality_is_still_present():
    # Existing public behaviour must not be rewritten as part of typography QA.
    for token in (
       'MAX_NEWS_ITEMS = 14',
       'NEWS_TITLE_BYTES = 224',
       'NEWS_MAX_BODY_BYTES = 12288',
       'RTC_DATA_ATTR static NewsCache g_retainedNews',
       'newsFeed, "latest"',
       'limit=14&links=0&raw_titles=1',
       'void invalidate()',
       'if (g_cache) g_cache->loaded = false;',
       'void preload() { ensureLoaded(); }',
       'if (!g_cache->loaded) fetchNews();',
       'adoptRenderStateSnapshot(JsonVariantConst snapshot)',
       'if (shallowLayout(c)) renderShallow(c);',
       'else renderList(c);',
       '"Nyheter" : "News"',
       'if (strlen(rawTitle) >= sizeof(item.title)) continue;',
    ):
        assert token in source, f"Lost existing News functionality: {token}"

def test_original_fonts_and_complete_text():
    assert 'RemindEditorialFonts::dm24()' in preview
    assert 'RemindEditorialFonts::dm18()' in preview
    assert 'RemindEditorialFonts::fraunces48()' in preview
    assert 'wrapTextToLines(source.title,lines,' in preview
    assert 'if(!complete || count<=0)return false;' in preview
    assert 'sourceIndex=sourceIndex;' in preview
    assert 'trial.overflow=g_cache->count-trial.shown;' in preview
    assert 'return false; // original production News renderer is unchanged fallback' in preview
    assert 'NEWS_EDITORIAL_MAX_BLOCKS = 8' in preview
    assert 'trial.shown=0;' in preview
    assert 'memset(&trial' not in preview
    assert 'font->yAdvance' in preview
    assert 'g_newsEditorialPlan=new(std::nothrow)' in preview

def test_no_risky_or_unrelated_code():
    for forbidden in ("httpGet", "NetClient::", "setConfig(", "fetchNews(", "invalidate(",
                      "prefs.", "WiFi", "OTA", "display.update"):
        assert forbidden not in preview, f"Unexpected nonvisual dependency: {forbidden}"
