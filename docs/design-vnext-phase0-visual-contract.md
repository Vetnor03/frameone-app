# RE:MIND Design vNext — fase 0: kildebaseline og visuell kontrakt

> **Status: dokumentert kildebaseline; fysisk golden/rollback-identitet fortsatt åpen.** ADR v0.1, 27.10.2026. Forelder: [#1429](https://github.com/Vetnor03/frameone-app/issues/1429), arbeid: [#1430](https://github.com/Vetnor03/frameone-app/issues/1430). Dette er **ikke** godkjenning til fontendring, firmwareflash, merge eller OTA.

## 1. Reproduserbar kilde-/rollback-baseline

- Inspisert `main` ved commit `5718eeae647655735298bdfef84723ab6e8a8cec` (27.10.2026). Beholdt uendret som `snapshot/pre-design-vnext-2026-10-27`. Dette er en **kilde-snapshot**, ikke dokumentasjon på at akkurat denne commiten ble kompilert/flashet og fotografert som kjent god fysisk firmware.
- Eksperimentell Layout Lab: [draft PR #1423](https://github.com/Vetnor03/frameone-app/pull/1423), gren `feat/editorial-responsive-system` ved `aaf16a3931e3e0e8c1d7033aa54ae826e379ce2a`. **Ikke merget**; inneholder også modifiserte Surf-filer og må **ikke** merges ukritisk mot frossen Surf.
- Faktisk «last-known-good flashed binary», versjon, kompilatorinnstillinger, fysisk foto med dato og original firmware-fonttest-6-kilde: **ikke knyttet til noen verifisert commit i tilgjengelige kilder**. Før firmwarearbeid: noter `git SHA`, fysisk `device_id`/HW-revisjon, Arduino/PlatformIO-buildprofil, binær-SHA256, skjermfoto og eksport av konfigurasjon *uten token/secrets*. Ikke bruk «latest main» som bekreftet fysisk rollback.
- Prosedyre når fysisk referanse er identifisert: gjenopprett akkurat verifisert binær for riktig Alfred-kort via USB, kontroller oppstart/paring/refresh/MQTT, og sammenlign lagret light/dark-foto. Ingen nedgradering på pilotrammer uten eksplisitt beslutning.
- Ingen Supabase-tabeller, konfigurasjoner, frametilknytninger eller prod-tilganger endres i fase 0.

## 2. Kart: faktisk renderer vs. Lab og Mirror

| Lag | Verifisert kilde og rolle | Begrensning |
| --- | --- | --- |
| Felles innebygde geometrier | `shared/frame-layouts.json` → `scripts/generate-frame-layouts.mjs` → `frame/src/core/GeneratedLayouts.h`; `app/lib/frameSimulator.ts` | Delte 800×480-celler, men **ikke** delte tekstrastere |
| Gamle visuelle modulprofiler | `shared/module-layout-profiles.json`; profiler for Date, Reminders, Weather, Countdown, Surf, Soccer, Stocks, Groceries | Ingen tilsvarende profil for News, Ski eller Assistant; profilen er ikke hele fremtidens kontrakt |
| Fysisk komposisjon | `frame/src/core/Layout.cpp`, `Layout.h`, `Types.h`, `Config.h`, `FrameConfig.cpp` | Validert 4×4-plan før tegning, navngitte presets, custom divider-topologi og atomisk fallback til DEFAULT |
| Fysisk display/panel | `frame/src/display/DisplayCore.cpp`, `DisplayType.h`, `frame/platformio.ini` | GxEPD2/Adafruit GFX, paged full/partial refresh, ink/paper fra Theme; maskin-/refreshadferd er utenfor denne PR |
| Celle-dispatch | `frame/src/modules/ModuleRenderer.cpp`, `AdaptiveModuleCapability.h` | Module + størrelse/adaptiv geometri avgjør konkret renderer; tom celle får «+» |
| Fysiske moduler | `frame/src/modules/ModuleDate.cpp`, `ModuleNews.cpp`, `ModuleReminders.cpp`, `ModuleWeather.cpp`; `ModuleSurf.cpp`, `ModuleSki.cpp`, `ModuleCountdown.cpp`, `ModuleSoccer.cpp`, `ModuleStocks.cpp`, `ModuleGroceries.cpp`, `ModuleAssistant.cpp` | Egen tekstmåling, content clipping og tegning per modul; ikke antatt pikselparitet med web |
| Fysisk tekst | `frame/src/display/FrameText.cpp` og `frame/src/assets/fonts/*` | UTF-8 normaliseres til Latin-1/ASCII-kontrollert GFX-utvalg; ikke en generisk UTF-8-renderer |
| Nåværende Studio/simulator | `app/frame-simulator/FrameSimulator.tsx`, `app/lib/frameSimulator.ts`, `app/lib/responsiveCellProfile.mjs`, `app/lib/*Responsive.mjs` | Bruker Canvas/Web-fonter, syntetiske normal/long/extreme/empty-data og 1-bit-kvantisering; **ikke** samme GFX-piksler |
| Mirror View | `app/HomePageClient.tsx` (+ frame/mirror snapshot-API) | Egen React/CSS-modulvisning; historisk paritetsrevisjon i `docs/frame-studio-module-parity.md` sier også at fontrasterisering avviker. Ny estetikk krever ny side-ved-side-test |
| Layout Lab draft | PR #1423: `app/editorial-lab/page.tsx`, `app/lib/editorialGridLab.mjs`, `editorialFrameLayout.mjs`, `editorialComposition.mjs`, `editorialPdfExport.mjs`, `docs/frame-editorial-design-system.md` | SVG/Georgia/Arial-eksempler, ikke Fraunces/DM Sans-firmware eller gjeldende pilot-output |

Tidligere dokumentert «PARITY» betyr **komposisjons-/regionsammenligning** av fire ankerstørrelser, ikke at fysisk bilde og Canvas/Mirror View er pikselidentiske. Draft-PRens 352 modul/geometri/tema-tilfeller, 100-siders PDF og stresstester er **digital QA**, ikke fysisk aksept.

## 3. Geometri: målbare invarianter (LOCKED som eksisterende oppførsel)

- **Panel = viewport = 800×480 px**, origo (0,0), landskap; logisk 4×4, kolonnebredde 200 px, radhøyde 120 px. `gridX=truncate(800×col/4)` og `gridY=truncate(480×row/4)`. Kalibrert 800×480 felles overstyrer ikke det separate passepartout-/synlig feltet i mekanikken.
- **Ingen ytre ramme**. Innerdivider har **95 % tegnelengde**: 2,5 % innrykk fra *egen* vertikal/horisontal region. Navngitt fullbredde-linje går fra (20,y) til (780,y); ved y=120 og 240 for Pyramid. Vertikal Pyramid-divider ved x=400: (400,246)–(400,474). Dette er dagens deterministiske tegnekoordinater; line-endpoints verifiseres før pixel-regresjon.
- **Ankergeometrier:** 4×1 → SMALL (800×120), 2×2 → MEDIUM (400×240), 4×2 → LARGE (800×240), 4×4 → XL (800×480). Øvrige 12 av totalt 16 `colSpan×rowSpan` får CELL_ADAPTIVE og **må testes per modul**.
- **Presets:** FULL én 4×4; DEFAULT to 4×1 over én 4×2; PYRAMID to 4×1 over to 2×2; SQUARE fire 2×2. Se den egentlige JSON-kontrakten. Endre ikke slot-rekkefølge/kalibrering i fase 0.
- **Tegnet custom-grid:** 1–16 rektangler; alle koordinater/heltall i 0..3, ingen overlapp, ingen hull, unike slotter 0..15 og full tiling av 16 ruter. Søknads-/device-validering krever i tillegg at modul er fysisk støttet i valgt geometri. Unassigned/tomme moduler beholder «+»; ugyldig aktiv fysisk custom-config gir atomisk DEFAULT-fallback, aldri delvis ødelagt ramme. Brukeren kan tegne **alle gyldige** geometrier: estetisk randomizer filtrerer kun *egne forslag*, ikke lovlige brukeroppsett.
- Deling/merge og T-/L-knutepunkter: divider-topologi er bestemt av naboceller; ikke tegn linje gjennom sammenslått rektangel. 95 % gjelder hver faktisk divider-segmentlengde.

### Case A — aktiv referansekonfig, kilde #1429 (snapshot, ikke live-avlesning nå)

`device_id=frm_801CCA76B144`, `theme=dark`, `layout=pyramid`; slot 0 **Date** [0,0,800,120], slot 1 **News** [0,120,800,120], slot 2 **Reminders** [0,240,400,240], slot 3 **Weather:1** [400,240,400,240]. Dette er en testfixture **fra tidligere Supabase-referanse**, ikke en hardkodet layout eller en nå bekreftet aktiv databaseverdi. Scenario lys/ mørk testes med samme geometri uten produksjonsendring.

### Case B — reproduserbar Layout Lab 100-PDF-review-seed

Fra PR #1423: `randomEditorialReviewGrid(20261027, 4)` (mulberry32-seed, density=4, ikke den estetisk filtrerte `randomEditorialGrid`): geometrisk full tiling med 4 moduler. Forventet deklarativt scenario:

| Slot | Modul | Grid col,row,span | Pixelboks |
| --- | --- | --- | --- |
| 0 | Date | (0,0,4,2) | (0,0,800,240) |
| 1 | Countdown | (0,2,2,2) | (0,240,400,240) |
| 2 | Stocks | (2,2,1,2) | (400,240,200,240) |
| 3 | Groceries | (3,2,1,2) | (600,240,200,240) |

Dette tilfellet er **Layout Lab-review/testcase**, ikke godkjent estetikk og ikke testet på fysisk skjerm. Bruk samme seed, mål, moduldata og tema ved framtidig Lab/Mirror/firmware-differanse. 100-review-generator velger `targetCount = 1 + i % 16` og `layoutSeed = (base + i×0x9E3779B9) >>> 0`; lagre *base-seed fra faktisk PDF* før påstander om å ha reprodusert akkurat en historisk PDF. Originale opplastede 100-siders PDF-er finnes i tidligere review, men er **ikke versjonert i repo** her.

## 4. Visuell kontrakt v0.1: mål for implementering, ikke nåværende firmwareløfte

**Visuell likhet, funksjonell semantikk og informasjonsrangering** skal være felles mellom Lab, Mirror og fysisk, selv om renderingsteknikk er ulik.

1. **Region og sikker tegning:** hver modul disponerer kun sin pixelboks. Beregn rektangler før tegning; kontrollér x/y/w/h, tekst-bounds, line advance, minimum gap, figur-bounds og naboseparator. Ingen viktig tekst utenfor cellen, ingen overlapp eller vilkårlig ellipsis, ingen dekor i annen moduls område. Bakgrunn fyller hele 800×480.
2. **Balansert dynamikk (kandidater fra PR #1423, IKKE produksjonstokens):** klassifiser etter faktisk boks: ribbon ved h<152 og w≥300; column ved w<260 og h≥152; compact ved w<260 eller h<152; spread ved w≥530 og h≥215; ellers card. Insets: 8 px (w<260 eller h<155), 16 px (spread), ellers 12 px. Gaps: 6/12/8 px i samme respektive rekkefølge. Én eller to kolonner ved plass; aldri tre automatiske tekstkolonner. Disse tallene samsvarer med draft `editorialFrameLayout.mjs`/`EditorialDesign.h` og skal kalibreres fysisk før LOCKED-status.
3. **Horisontal/vertikal justering:** identitet og hovedfakta skal ha tydelig leseretning; ribbon kan arrangere identitet/hovedfakta/kontekst vannrett, column vertikalt, spread kan ha to balanserte soner. Align tekst etter faktiske glyph-bounds (inkl. offset), ikke bare sentrert CSS-line-height. Dagens fysiske moduler varierer; ingen generell baseline-/kerningmotor er implementert ennå.
4. **Informasjonsroller (godkjent prinsipp):** HERO (dato/temperatur/tall), HEADING, PRIMARY (headline/reminder), SECONDARY (konkret kontekst), LIST_ITEM, MEASUREMENT, FIGURE, DIVIDER. Prioritet er separat: *essential > important > optional > decorative*. Ikke fjern kritisk dato/tid/temperatur/score for å vise flere rader eller illustrasjoner. For Reminders/News fjern lavprioriterte elementer før du krymper hovedinnhold. Behold Today/Tomorrow- og skip-regler, News fullstendighet/trygg plasshåndtering, Weather etter 20:00 og unngå duplisert helgeinnsikt.
5. **Overflow:** følg (a) mål tekst med den faktiske fonten, (b) bryt ved ordgrense og definerte linjetak, (c) prioriter færre elementer eller tydelig `+N` fremfor uleselige linjer, (d) gå gradvis ned bare der rollen tillater det, (e) vis bevisst state dersom essensielt innhold ikke kan formidles. Verken skjult innhold, «...»-avkuttet meningsbærende overskrift eller tilfeldig nedskalering er akseptert. Spesielt 1×1 kan ikke lovlig forventes å være lesbar fra 2 m med 16 moduler; geometrien er fortsatt tillatt.
6. **Dekorplasser:** Weather/Date kan få enkel poetisk kyst-/botanisk figur **etter** typografi- og densitetssjekk. Draft begrenser art til spread med safeHeight≥240 og safeWidth≥560; valgfri divider ved safeWidth≥610/safeHeight≥200. Fine 1-bit-streker; ikke gråtoner som oppstår ved kornete miniatyr-skalering. Meteorologisk tilstandsikon er funksjonelt og kan ikke erstattes av pynt. **Surf: ingen ny figur/ornament.**
7. **Panel:** sammenlign faktisk 1-bit raster (svart/hvitt) i Light og Dark før eventuell kontrollert greyscale; Canvas-kvantisering og HTML-antialias er ikke automatisk lik fysisk GxEPD2.

### Typografisk benchmark og status

- **Godkjent fysisk retning:** seks skjermer prøvd; **skjerm 6 Fraunces + DM Sans** var favoritten og merkbart skarpere enn en senere, kornete Pyramid-test. **72/48 px** er ønskede store displayroller fra testplanen; **18 pt** primær (godkjent komfortabel 1–3 m), **12 pt** sekundær, **9 pt** kun lavprioritert detalj. Dette er *mål/observasjoner*, **ikke** påstand om at 18 pt=18 px eller at de opprinnelige glyph-filene allerede finnes i repo.
- **Faktisk `main`:** `FreeSans9ptNO.h`, `FreeSans12ptNO.h`, `FreeSansBold12ptNO.h`, `FreeSansBold18ptNO.h` har GFX/Latin-1-range 0x20..0xFF; Date forsøker `FreeSansBold24ptNO.h` som **ikke finnes i fontmappen**, og faller til Adafruit `FreeSansBold24pt7b.h`. Flere moduler bruker eksisterende FreeSans9/12/18, News bruker 9pt regular og 12pt bold. `FrameText.cpp` normaliserer ÆØÅæøå til Latin-1 og erstatter enkelte Unicode-tegn med ASCII: ikke forveksle dette med TrueType UTF-8/shaping.
- **Fonttest-6-assets GJENFUNNET 27.10** i privat tidligere `RE-MIND-Fancy-Fonts-Arduino-IDE.zip`: `EditorialCandidates.h` inneholder ekte originaltest-bitmapobjekter `RemindFraunces72/48`, `RemindDM24/18` og skjerm-6-renderer `TypographyAudit.cpp`, med verifiserte hashes/Latin-1-ÆØÅ. Se [eksakt fontproveniens og resterende hull](design-vnext-phase0-font-provenance.md). **Ikke** lagt inn i produksjonsrepo. **Draft Lab** bruker fortsatt Georgia/Arial og FreeSans-tokens; ikke en produksjonsklar Fraunces/DM Sans-rastermotor. Eksakt original TTF/versjon, generator-parametre og flashed testbinær er fortsatt uverifisert.
- **Aksept-gate for neste fase:** lag sammenligningsskjerm med «Æ Ø Å æ ø å», «Vær 18°», tall, tegnsetting, sammenhengende mellomrom og lengre News/Reminders-tekst ved originale 72/48-displayroller og målt 18/12/9-rolle. Logg fontnavn+versjon, glyph xAdvance/xOffset/yOffset, bounding-box, baseline, linjeavstand, faktisk pixelhøyde, bildehash og fysisk bilder for Light/Dark fra 1/2/3 m. Reject ved manglende tegn, feil spacing, uventet wrapping, ruglete/kornete konturer eller lesbarhet som er dårligere enn skjerm 6. **Ingen fontimplementering i fase 0.**

## 5. Modul-/variantinventar, status 27.10

Alle 11 modulnavn finnes i `shared/frame-modules.json`; `module-layout-profiles.json` dekker 8. Med 4 ankerformer og 12 øvrige merged 4×4-former er 16 geometrityper mulig. `AdaptiveModuleCapability.h` i main er en **capability/dispatch-gate**, ikke fysisk QA-bevis. `Studio` har `responsiveCellProfile.mjs` for 9 moduler; News/Ski må sammenlignes med egne faktiske kodebaner.

| Modul | Ankere SMALL/MEDIUM/LARGE/XL | Uvanlige 4×4 merged | Designstatus |
| --- | --- | --- | --- |
| Date | Firmware finnes | Adaptive vei finnes | Godkjent floristisk/kalender-retning, **ikke** gjennomtestet vNext-fysisk |
| News | Firmware finnes | Fysisk capability finnes; Studio særbehandling | Innholdsprioritet låst; nytt design uprøvd |
| Reminders | Firmware finnes | Adaptive vei finnes | Prioritets-/Today/Tomorrow-/skip-regler låst; typografi uprøvd |
| Weather | Firmware finnes | Adaptive vei finnes | Temperatur hero; **rainy coastal v2** godkjent i Lab som visuell retning; andre skyvarianter og fysisk QA gjenstår |
| Surf | Firmware finnes | Adaptive vei finnes | **FROSSET: alle størrelser, score, symboler, teksthierarki, geometrier og funksjon** |
| Ski | Firmware finnes | Fysisk capability finnes; Studio særbehandling | Ingen individuell vNext-godkjenning |
| Countdown | Firmware finnes | Adaptive vei finnes | Ingen individuell vNext-godkjenning |
| Soccer | Firmware finnes | Adaptive vei finnes | Ingen individuell vNext-godkjenning |
| Stocks | Firmware finnes | Adaptive vei finnes | Ingen individuell vNext-godkjenning |
| Groceries | Firmware finnes | Adaptive vei finnes | Ingen individuell vNext-godkjenning |
| Assistant / AI Follow | Firmware finnes, appfunksjon kan være skjult i pilot | Adaptive vei finnes | Ikke pilotreferanse; ingen individuell vNext-godkjenning |

Ikke hevde at en modul som er **kode-støttet** er **estetisk godkjent** eller **fysisk kontrollert**. Draft #1423 er inspirasjon, ikke baseline for å overstyre produksjons-Surf.

## 6. Surf: write-free kildegolden + fysisk regresjonsplan

**Ingen kodediff i Surf.** Baseline under Git blob SHA (ikke bildehash):
- `frame/src/modules/ModuleSurf.cpp` = `8651d398727c817e514a667edd0f5b9ea002a455`.
- `frame/src/modules/ModuleSurf.h` = `8d9d6224dab2850f0eebe74a2de895845bd0174a`.
- `frame/src/modules/SurfAdaptivePolicy.h` = `9a8b29e6671916d90bfa5ef1142b6c24d1e12492`.
- `app/lib/surfResponsive.mjs` = `fabaee92bf3de7ce2761f18fdc4bfbf82756d11f`.

**Forenklet Surf-frys, besluttet av eier 27.10.2026:** Surf skal **ikke redesignes eller få kildekodeendringer**. Det private fotoet av **Surf MEDIUM 2×2 Dark** er tilstrekkelig fysisk startreferanse for fase 0, i tillegg til SHA-frys av Surf-kildene. Flere Surf-foto i 4×1, Light/Dark, Large/XL/custom er **valgfrie QA-utvidelser**, ikke krav eller blokkere for font-/designarbeid på andre moduler. Når delt font-, tekst-, divider- eller layoutinfrastruktur endres, gjør vi i stedet **én enkel fysisk Surf-smoke-test mot dagens referanse før utrulling**, for å fange indirekte påvirkning. Kun avvik utløser mer målrettet kontroll. Samme data/geometri må brukes før man konkluderer med en faktisk visuell regresjon.

Automatiserte fase-0 tester fryser kilde-fingerprints og preset/fixture-geo. Enhver endring i frosne Surf-kilder skal stoppes og begrunnes eksplisitt i #1429. Delte rendererendringer kan indirekte påvirke Surf, derfor beholdes **én fysisk Surf-smoke-test før utrulling**; ikke krev en full matrise eller nye bilder nå.

## 7. Testplan/gates før fase 1

1. **Fase-0 CI:** kjør `node --test tests/design-vnext-phase0-baseline.test.mjs`, `npm run check:frame-layouts`, `npm run typecheck`, stabilt testsett og changed-file lint. GitHub Actions på PR dokumenterer resultater. Denne PR-en har kun dokumentasjon/test, ikke firmwarekode.
2. **Benchmark/fysisk baseline (delvis dokumentert):** P0 Dark Pyramid og S2 Surf 2×2 MEDIUM Dark er mottatt som private fotografier 27.10.2026 med firmware 2.7.3 *tidligere oppgitt av eier*; se [opptakslogg](design-vnext-phase0-physical-golden-capture.md). Identifiser fortsatt trygg firmware-rollback; skjerm-6 bitmap-header er gjenfunnet i privat arkiv (se [fontproveniens](design-vnext-phase0-font-provenance.md)), men opprinnelig TTF/generator og flash-identitet mangler. **Ingen flere Surf-foto kreves før vi går videre.** Første pilotkomparasjon skal ikke bruke eksperimentell PR #1423 som om den var fysisk referanse.
3. **Visuelle differanser:** projiser input for seed 20261027 og gjeldende Pyramid identisk gjennom Lab, Mirror og firmware. Mål geometri/bounds/line count/overflow/visuell hierarki, både lang/tom/normal tekst, 1×1..4×4, 1..16 moduler og Light/Dark. Ikke godkjenn basert bare på PDF eller 352 Canvas-tilfeller.
4. **Pilotregresjon:** ikke endre MQTT, pairing, OTA, wake, batteri, Power Save, modulfelt/data eller aktiv Supabase-config. Sikre full fallback og mulighet for rollback. Delt layout-/fontmotor må bestå Surf-source-gate og en **enkel fysisk Surf-smoke-test før utrulling**, mot mottatt 2×2 Dark-foto; ingen full golden-matrise kreves.
5. **Exit-kriterium fase 0:** ADR + kilde/kart + seeddokumentasjon verifisert i PR; resterende rollback-/flash-gater og ufullstendig upstream-TTF/generator-proveniens dokumentert som åpne, ikke skjult bak grønn CI. **Fase 1/fontmotor startes først etter baselinebeslutning og fysisk referanse er lagret.**

### Åpne avklaringer / ikke påstå verifisert

- Eksakt flash-commit/binær som ga «font test screen 6» og original upstream TTF/variabelakser, rastergenerator og komplett lisensgrunnlag. GFX-bitmapbyte og SHA256 er **funnet i brukerens private 25.10-arkiv**; ingen ny generering eller fontmotor er startet.
- P0 Pyramid Dark og S2 Surf MEDIUM Dark er mottatt som private fysiske foto for tidligere oppgitt firmware 2.7.3, **ikke offentlig publisert eller verifisert mot binær**; øvrige Surf-varianter er valgfrie QA-utvidelser (ikke blokkere), mens eventuell panel-/fontkvalitet må vurderes ved faktisk designendring.
- Om seed-fixture viser identisk faktisk output i den umodifiserte draft Lab ved PR-head; scenarioet er deterministisk fra dokumentert generator, men selve Playwright-bildet er ikke vedlagt denne PR.
- Verifisert pixel-paritet Lab/Mirror/firmware utover geometri; ingen slik generell paritet er hevdet her.
