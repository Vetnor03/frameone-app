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
    assert 'profile_titles"]["compact"]' in NEWS_CPP
    assert 'profile_titles"]["standard"]' in NEWS_CPP
    assert '#define NEWS_FONT_BODY (&FreeSansBold12pt8b)' in NEWS_CPP
    assert 'headlines arrive already semantically shortened by the title optimizer' in NEWS_CPP.lower()
    assert 'calendar' not in NEWS_CPP.lower()


def test_news_module_is_adaptive():
    assert 'exactOnly(module, "news")' in CAPABILITY


def test_news_wraps_complete_optimized_titles_before_reducing_story_count():
    assert 'wrapTextToLines' in NEWS_CPP
    assert 'show as many newest stories as actually fit' in NEWS_CPP
    assert 'if (nextH > availableH) break;' in NEWS_CPP
    assert 'fitTextToWidth(displayTitle(g_cache->items[i], false)' not in NEWS_CPP
