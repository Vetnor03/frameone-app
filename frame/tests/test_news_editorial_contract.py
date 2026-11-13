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

def test_subtle_list_ornaments_do_not_replace_content():
    # Editorial marker is separately drawn in real 1-bit pixels.
    assert "static void newsEditorialLozenge(" in preview
    assert "d.drawPixel(cx-dx,cy+dy,color);" in preview
    assert "d.drawPixel(cx+dx,cy+dy,color);" in preview
    assert "out.markerX=marginMarker?x:x+7;" in preview
    assert "out.markerR=3; // same refined diamond size" in preview
    assert "out.x=x+markerInset;" in preview
    assert "const int markerInset=normalMarker?19:marginMarker?7:0;" in preview
    assert "const int pad=max(c.w<=220?14:10," in preview
    assert "const bool normalMarker=g_cache->count>1 && w>=184;" in preview
    assert "const bool marginMarker=g_cache->count>1 && compactSideMarker &&" in preview
    assert "const bool compactSideMarker=c.w<=220;" in preview
    assert "bodyFont,compactSideMarker))break;" in preview
    assert "if(block.markerR>0)" in preview
    assert "newsEditorialLozenge(block.markerX,block.markerY,block.markerR);" in preview
    assert "newsEditorialBalance(trial,bodyY+bodyH);" in preview
    assert "newsEditorialBalance(featured,bodyY+bodyH);" in preview

def test_no_risky_or_unrelated_code():
    for forbidden in ("httpGet", "NetClient::", "setConfig(", "fetchNews(", "invalidate(",
                      "prefs.", "WiFi", "OTA", "display.update"):
        assert forbidden not in preview, f"Unexpected nonvisual dependency: {forbidden}"
