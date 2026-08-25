#include "../src/display/FrameText.h"

#include <assert.h>
#include <string.h>

static void expect(const char* input, const char* expected) {
  char output[256];
  FrameText::normalizeUtf8ForDisplay(output, sizeof(output), input);
  assert(strcmp(output, expected) == 0);
  assert(strchr(output, '?') == nullptr);
}

int main() {
  char weather[256];
  FrameText::normalizeUtf8ForDisplay(weather, sizeof(weather),
    "Clear and dry through tonight, reaching 20°C this afternoon.");
  assert(strcmp(weather, "Clear and dry through tonight, reaching 20\xB0\x43 this afternoon.") == 0);
  assert(strchr(weather, static_cast<char>(0xC2)) == nullptr);
  assert(strchr(weather, '?') == nullptr);

  expect("Besøk farmor på Ålgård", "Bes\xF8k farmor p\xE5 \xC5lg\xE5rd");
  expect("Møte med Øyvind", "M\xF8te med \xD8yvind");
  expect("Ærlig talt", "\xC6rlig talt");
  expect("Møte – Lene’s «plan»…", "M\xF8te - Lene's \"plan\"...");
  expect("Fotball ⚽ kl. 18 😊", "Fotball kl. 18");
  expect("Café München", "Cafe Munchen");
  expect("Bodø/Glimt", "Bod\xF8/Glimt");
  expect("Tromsø", "Troms\xF8");
  expect("José María – mål ⚽", "Jose Maria - m\xE5l");
  expect("Tromsø’s «keeper» 😊", "Troms\xF8's \"keeper\"");
  expect("bad \xF0\x28\x8C\x28 glyph", "bad (( glyph");

  char firstConfig[48];
  char repeatedConfig[48];
  FrameText::normalizeUtf8ForDisplay(firstConfig, sizeof(firstConfig), "Bodø/Glimt");
  FrameText::normalizeUtf8ForDisplay(repeatedConfig, sizeof(repeatedConfig), "Bodø/Glimt");
  assert(strcmp(firstConfig, repeatedConfig) == 0);
  assert(FrameText::displayEqualsUtf8(firstConfig, "Bodø/Glimt", repeatedConfig, sizeof(repeatedConfig)));

  // Config names are stored as display bytes. When the API omits its UTF-8
  // name, Soccer must copy that fallback rather than normalize it a second time.
  char teamFallback[48];
  char competitionConfig[48];
  char competitionFallback[48];
  FrameText::normalizeUtf8ForDisplay(competitionConfig, sizeof(competitionConfig), "Tromsø Liga");
  strcpy(teamFallback, firstConfig);
  strcpy(competitionFallback, competitionConfig);
  assert(strcmp(teamFallback, "Bod\xF8/Glimt") == 0);
  assert(strcmp(competitionFallback, "Troms\xF8 Liga") == 0);

  char question[32];
  FrameText::normalizeUtf8ForDisplay(question, sizeof(question), "Kommer du?");
  assert(strcmp(question, "Kommer du?") == 0);
  return 0;
}
