from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NEWS_CPP = (ROOT / "src" / "modules" / "ModuleNews.cpp").read_text(encoding="utf-8")
RENDERER = (ROOT / "src" / "modules" / "ModuleRenderer.cpp").read_text(encoding="utf-8")
CAPABILITY = (ROOT / "src" / "modules" / "AdaptiveModuleCapability.h").read_text(encoding="utf-8")
INO = (ROOT / "src" / "frame_v2.5.1.ino").read_text(encoding="utf-8")


def test_news_module_is_wired_into_renderer_and_preload():
    assert '#include "ModuleNews.h"' in RENDERER
    assert 'ModuleNews::render(c, mod);' in RENDERER
    assert 'ModuleNews::setConfig(&g_cfg);' in INO
    assert 'ModuleNews::preload();' in INO


def test_news_module_uses_only_headline_space():
    assert 'MAX_NEWS_ITEMS = 14' in NEWS_CPP
    assert '"Nyheter" : "News"' in NEWS_CPP
    assert '#define NEWS_FONT_BODY (&FreeSans12ptNO8b)' in NEWS_CPP
    assert '#define NEWS_FONT_HEADER (&FreeSansBold12pt8b)' in NEWS_CPP
    assert 'raw_titles=1' in NEWS_CPP
    assert 'profile_titles' not in NEWS_CPP
    assert 'calendar' not in NEWS_CPP
    assert 'static_assert(sizeof(NewsCache) <= 4096' in NEWS_CPP



def test_news_module_is_adaptive():
    assert 'exactOnly(module, "news")' in CAPABILITY


def test_news_wraps_complete_original_titles_before_reducing_story_count():
    assert 'wrapTextToLines' in NEWS_CPP
    assert 'show as many newest stories as actually fit' in NEWS_CPP
    assert 'if (nextH > availableH)' in NEWS_CPP
    assert 'selected[visible++] = i;' in NEWS_CPP
    assert 'for (int columns = candidateCount; columns >= 1' in NEWS_CPP
    assert 'if (strlen(rawTitle) >= sizeof(item.title)) continue;' in NEWS_CPP
    assert 'fitTextToWidth' not in NEWS_CPP
    assert 'return 0;' in NEWS_CPP[NEWS_CPP.index('// Even a long single word'):NEWS_CPP.index('static int drawHeader')]


def test_news_regular_twelve_font_preserves_norwegian_glyphs():
    font = (ROOT / "src" / "assets" / "fonts" / "FreeSans12ptNO.h").read_text(encoding="utf-8")
    assert 'const GFXfont FreeSans12ptNO8b' in font
    assert '0x20, 0xFF, 29' in font
    import re
    glyphs = re.findall(r'\{\s*\d+,\s*\d+,\s*\d+,\s*\d+,\s*-?\d+,\s*-?\d+\s*\}', font)
    assert len(glyphs) == 224
    for cp in (0xC5, 0xC6, 0xD8, 0xE5, 0xE6, 0xF8):
        offset, width, height, advance, x, y = map(int, re.findall(r'-?\d+', glyphs[cp - 0x20]))
        assert width > 0 and height > 0 and advance > 0


def test_news_cache_is_preserved_across_unrelated_redraws():
    # The cheap update probe and unrelated module redraws cannot force News IO.
    news = NEWS_CPP[NEWS_CPP.index('void setConfig('):]
    assert 'void setConfig(const FrameConfig* cfg)' in news
    assert 'g_cfg = cfg;' in news
    assert 'clearCache()' not in news
    assert 'void preload() { ensureLoaded(); }' in news
    assert 'if (!g_cache->loaded) fetchNews();' in NEWS_CPP
    assert 'void invalidate()' in news


def test_news_is_invalidated_only_for_manual_or_changed_visible_content():
    manual = INO[INO.index('static bool fetchAndRenderExplicit'):INO.index('static bool refreshContentSignatureBestEffort')]
    scheduled = INO[INO.index('ContentRevisionState revisionState;'):]
    assert 'ModuleNews::invalidate();' in manual
    assert manual.index('ModuleNews::invalidate();') < manual.index('renderSmartDashboard(batt, pwr, desired, displayPlan)')
    assert 'if (desired.modules[i].key == "news" && displayPlan.dirty[i])' in scheduled
    assert 'ModuleNews::invalidate();' in scheduled
    assert 'ModuleNews::invalidateScheduled' not in INO


def test_alfred_retains_headlines_across_power_save_deep_sleep_without_nvs_writes():
    assert '#if defined(FRAME_IS_ALFRED_V1_2)' in NEWS_CPP
    assert 'RTC_DATA_ATTR static NewsCache g_retainedNews;' in NEWS_CPP
    assert 'g_cache = &g_retainedNews;' in NEWS_CPP
    assert 'g_retainedNewsMagic != NEWS_RTC_CACHE_MAGIC' in NEWS_CPP
    assert 'prefs.put' not in NEWS_CPP
