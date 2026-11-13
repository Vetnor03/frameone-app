# RE:MIND Design vNext — fontmotor, implementeringsplan v0.1

**Dato:** 27.10.2026. **Status: KUN PLAN / source review**, ingen implementasjon, kompilering av ny motor, flashing, OTA, app/backend- eller Surf-endring. Under [hovedtracker #1429](https://github.com/Vetnor03/frameone-app/issues/1429) og [fase-0-issue #1430](https://github.com/Vetnor03/frameone-app/issues/1430). Font-referanse og ZIP-hasher er dokumentert i [skjerm-6-proveniens](design-vnext-phase0-font-provenance.md); fysisk baseline i [0E-protokollen](design-vnext-phase0-physical-golden-capture.md).

## 1. Kildebasert utgangspunkt, ikke gjetning

- **Fysisk godkjent designretning:** skjerm 6 = Fraunces + DM Sans i 1-bit. Originalt diagnostikkarkiv `RE-MIND-Fancy-Fonts-Arduino-IDE.zip` fra brukerens private filbibliotek er gjenfunnet. `EditorialCandidates.h` har `RemindFraunces72`, `RemindFraunces48`, `RemindDM24`, `RemindDM18` med Latin-1 `0x20..0xFF`, `setTextSize(1)`, og den opprinnelige `TypographyAudit.cpp` velger disse på testside 6. **Ikke bruk senere SVG/HTML/PDF eller ny Google-Fonts-konvertering som byte-ekvivalent kilde.**
- **Størrelser:** 72/48/24/18 i disse symbolene er *nominal bitmap pixel designs*, ikke punkt (`pt`). Faktiske GFX `yAdvance` = 92/62/34/26 px. Hverken glyph-bildehøyde eller lesbarhet ved 1–2 m kan leses ut av fontnavn; mål faktiske `getTextBounds` og fysisk panel. Brukerens 18pt primær / 12pt sekundær / 9pt lavprioritert er **lesbarhetsmål**, og må testes mot de tilgjengelige *px*-glyphs uten falsk 1:1-enhetskonvertering.
- **Målt potensiell plass i firmware:** parse av test-headers 1-bit glyph-data: Fraunces72 = 46 927 bitmapbytes; Fraunces48 = 22 127; DM24 = 5 732; DM18 = 3 298. 78 084 bytes bitmaps + 4×224×7 = ca. 6 272 bytes `GFXglyph` = **ca. 84 356 bytes**, pluss 4 `GFXfont` strukturer/alignment. Dette er et *estimat for isolerte fire familiesnitt*, **ikke** en faktisk Arduino/PlatformIO `.bin`-differanse. Den tekstlige `EditorialCandidates.h` er ~884 KB og inneholder *ytterligere to* Instrument Serif-kandidater som **ikke** skal inkluderes i vNext. Portering som én globalt inkludert header kan skape unødvendige duplikater/bloat; mål linker- og mapresultater før beslutning.
- **Dagens produksjonsrenderer:** `frame/src/modules/ModuleRenderer.cpp` dispatcher Date/News/Reminders/Weather/**Surf** separat. Hver av `ModuleDate.cpp`, `ModuleNews.cpp`, `ModuleReminders.cpp` og `ModuleWeather.cpp` bruker egne `measureText`-hjelpere med GxEPD2 `getTextBounds(...,0,0,...)`, `setFont`, `setTextSize(1)`; News bryter linjer etter tekstbredde og nekter ufullstendige overskrifter; Reminders har egen `fitTextToWidth`; Weather måler blant annet `Ag` og sentrerer selv. **Ikke masseerstatt**: disse har viktig modulspesifikk semantikk som må bevares.
- **Normalisering:** `frame/src/display/FrameText.cpp` normaliserer UTF-8 til Latin-1/trygg ASCII, inkluderer ÆØÅæøå og kombinert A/a + U+030A. Den filtrerer bevisst enkelte ukjente symboler og trimmespaces. Fontmotoren skal **bruke eksisterende normalisering** og samme byte-sekvens ved måling, wrapping og tegning; ingen alternativ UTF-8-dekoder i moduler.

## 2. Teknisk arkitektur, første smale vertikale snitt

1. **Assets i én kompilasjonsenhet, ikke globalt:** etter lisenskontroll trekkes bare de fire godkjente `GFXfont`-objektene og tilhørende `Bitmaps/Glyphs` *byte-identisk* ut fra `EditorialCandidates.h`. Planlagt `frame/src/assets/fonts/RemindEditorialFonts.cpp` eksporterer typed/const-tilgang fra deklarasjon i `RemindEditorialFonts.h`, kompilert **kun én gang**. Ingen Instrument Serif og ingen runtime TTF. Respektér PROGMEM/pointertyper og dagens Flat Arduino-preparerer. Som første steg: spor kilde/lisens, lås referanse-hasher, og bevis at eksportert data er bit-for-bit samme som testen.
2. **Opt-in tekstverktøy:** nytt, isolert `frame/src/display/EditorialText.h/.cpp` (arbeidsnavn) med `normalize -> measure -> fit -> draw`; tar explicit `const GFXfont*`, `Cell`/pixelrektangel, text role, tema-farger og prioritet. Må **ikke** endre eksisterende `FrameText` eller `DisplayCore`-default i første PR. Returner mål (ink bounds: x1/y1/w/h) **og** glyph-advance/linjehøyde separat; kursorsetting skal bruke negative x/y-offsets. Alle beregninger i **faktiske 800×480 panelpiksler** og `setTextSize(1)`.
3. **Kontrollert komposisjon:** felles tekstprimitive tilbyr venstre/sentrert align, margin/padding, baseline og maks linjer. For wrapper må måledata og tegnede bytes være identiske. Lange tokens håndteres deterministisk: wrap etter ordgrense; om essensielt innhold ikke passer, prioriter færre elementer eller eksplisitt `+N`, *ikke* vilkårlig 9-px nedskalering. Hindre glyph-løp utenfor `Cell` og divider ved å avvise/tilpasse før draw; **ikke anta** at Adafruit/GxEPD2 automatisk klipper til cellen. Ikke aktiver ukontrollert tekst-autowrap ved skjermgrensen.
4. **Eksplisitt modulopptak:** første migrering **kun Date** med bakoverkompatibel fallback, deretter News, Reminders, Weather i separate PR-er. Ingen generelt `setFont`-bytte i `ModuleRenderer.cpp`; ingen globale `#define FONT_B*`-endringer. News' bevisste `complete`-/no-cut-semantikk, Reminders' Today/Tomorrow/priority/skip, Weather' after-20:00/temperature-hero må bevares. Full, Default, Pyramid, Square og tegnet 4×4 må alle behandles gjennom samme `Cell`-geometri; unngå hardkodet Pyramid.
5. **Surf ABSOLUTT UNNTAK:** aldri endre `ModuleSurf.cpp`, `ModuleSurf.h`, `SurfAdaptivePolicy.h` eller `app/lib/surfResponsive.mjs`. Ikke gjør nye fonter til global default, ikke endre shared layout, tema, GxEPD2-innstillinger eller `FrameText` under denne oppgaven. Eksisterende SHA-kildetest må forbli grønn. Når senere felles codepaths endres, kontrollér **ett fysisk Surf 2×2 Dark-scenario før utrulling** mot privat referanse, ikke en stor bilde-matrise.

## 3. Rollenavn og tetthetsregel — foreslått, må fysisk godkjennes

| Visuell rolle | Første fonthypotese | Bruk | Innholdsprioritet |
| --- | --- | --- | --- |
| DISPLAY_HERO | Fraunces72, fallback Fraunces48 | kort tall/dato på stor boks | essensiell |
| DISPLAY_HEADING | Fraunces48, fallback DM24 | overskrift med nok bredde | viktig |
| PRIMARY | DM24, eventuelt DM18 ved smale bokser | vær/hendelse/headline | essensiell/viktig |
| SECONDARY | DM18 | kontekst med dokumentert nytte | viktig |
| MICRO / MEASUREMENT | eksisterende FreeSans9ptNO eller eksisterende passende detaljfont, *foreløpig* | bevisst nisjedetalj, ikke skjult hovedtekst | valgfri |

- Dette er **semantiske roller**, ikke «bruk 72 på alle datoer». Rekkefølge: mål reell tekst → velg ønsket rolle hvis ink-bounds passer → fjern valgfritt innhold → fallback bare etter eksplisitt rollegrense. En 1×1-celle kan ikke garanteres leselig fra 2 m; ikke forby gyldig brukerlayout.
- Fallbacken til eksisterende FreeSans er foreløpig. Videre **12/9pt**-krav må kalibreres mot fysiske GFX-størrelser før nye DM Sans-rastere genereres. 9pt skal aldri være automatisk løsning på liten plass.
- Tokenverdier for padding, kolonnebredder, baseline/line-height og ornamentplasering er **provisoriske** til Date 4×1/2×2 og News/Weather fysisk er evaluert; referer `docs/design-vnext-phase0-visual-contract.md`. Ikke påstå Lab, Mirror og fysisk allerede er pixelidentiske.

## 4. Korte, uavhengig verifiserbare oppgaver etter planstadiet

| Del | Isolert leveranse | Grønt krav / stoppsignal |
| --- | --- | --- |
| **F1 Font-assets** | verifisert 4-font set + SIL OFL lisenskjede + kildehash + glyph coverage, uten migrering | asset-byteparitet med arkivet; `ÆØÅæøå`, `°`, tegnsetting; PlatformIO og Arduino-compile; `size`/map mot baseline; ingen Surf-diff |
| **F2 Tekstprimitive** | opt-in metrikk/tekstplassering uten modulmigrering | deterministisk getTextBounds/xAdvance/baseline/empty/spaces, ingen modul-diff, bygg og native tester; gammel renderer upåvirket |
| **F3 Date først** | kun Date opt-in, gammel implementering bevart bak avgrenset dev-flag/fallback | 4×1/2×2/4×4/custom i Light/Dark, kalender/ÆØÅ, 1–2m foto, ingen klipp/overlapp; Surf-kildefrys |
| **F4 News, så Reminders, så Weather** | én modul per endring, ikke samtidig | hver sin prioriterings-/overflow-suite, ingen bortfall av eksisterende funksjon; test både Lab/Mirror/fysisk |
| **F5 Pilotbeslutning** | sammenlign før/etter, firmware-binær+rollback, staging/QA, eventuelt pilot-flag | **ingen OTA/flash til piloten uten kjent god rollback og eksplisitt aksept**; ett Surf-smoke-bilde før utrulling |

**Neste deloppgave er F1, ikke F2–F5 i samme chat.** Planen og nåværende dokumentasjons-PR innebærer **null endring i prod**, og eksisterende v2.7.3 på enheten beholdes urørt.

## 5. Aksept/gaps for denne plan-PR

- [x] Fysisk test-6-arkiv og 4 kandidatfonter kontrollert (opprinnelig kode, checksums, størrelse, yAdvance, Latin-1).
- [x] Faktiske produksjonsmapper for Date/News/Reminders/Weather og normalisering identifisert.
- [x] Surf-frys og en *enkel framtidig* fysisk smoke-test spesifisert, uten mer bildeinnsamling nå.
- [ ] Kompilert fontasset-bygge-/minnebudsjett testet — **utføres F1**.
- [ ] Faktisk `xAdvance`/wrap/ink-rect-paritet, reproduserbar TTF-konvertering/OFL-lisenspakke — **utføres F1/F2**.
- [ ] Date og senere fysiske moduler QA-godkjent — **utføres F3+**.
- [ ] Bekreftet identisk v2.7.3 rollback-binary/flash SHA — **fortsatt åpen; ikke trekkes fra `FW_VER`-streng**.
