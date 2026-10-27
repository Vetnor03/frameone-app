# RE:MIND Design vNext — F3R/R1: 16 Date-geometrier, eksisterende regler og migreringskontrakt

**Dato:** 27.10.2026 · **Status:** R1 kildekartlegging og beslutningsgrunnlag, **ingen renderer-, font-, layout- eller Surf-endring**. Under [issue #1435](https://github.com/Vetnor03/frameone-app/issues/1435), hovedtracker [#1429](https://github.com/Vetnor03/frameone-app/issues/1429), med [F3 draft PR #1434](https://github.com/Vetnor03/frameone-app/pull/1434) som kildebaseline.

## 1. Nøyaktig omfang og kilder

Kildeversjoner inspisert på stablet F3-gren (`d581ed9e0b3aaca1cf69d2a6b0fd1c6174bb9f95`):
- `shared/frame-layouts.json` og `frame/src/core/GeneratedLayouts.h`: fysiske **ankerformer** 4×1 SMALL, 2×2 MEDIUM, 4×2 LARGE, 4×4 XL; resten gis CELL_ADAPTIVE via custom-grid.
- `app/lib/responsiveCellProfile.mjs`: alle 16 ruteformer er lovlige, men Studio dispatch setter **legacy** på de fire ankerformene og `date-responsive` på de andre.
- `app/lib/dateResponsive.mjs` (`dateComposition`, `dateLayout`): micro/horizontal/stack/calendar-split/expanded-beslutninger og informasjonstetthet.
- `frame/src/modules/ModuleDate.cpp` (`renderDate`, `drawAdaptiveDate`): fire tidligere håndskrevne anker-renderere + adaptiv implementasjon; på F3-kandidat kun **4×1 og 2×2** får `REMIND_F3_DATE_PREVIEW_ENABLED=1` opt-in Fraunces/DM Sans.
- `frame/src/display/EditorialText.h/.cpp`: måler **faktisk** GFX glyph ink-rect og advance, kan avvise tekst som ikke passer. Fontbytes `RemindFraunces72/48`, `RemindDM24/18` fra F1.
- Visuell kontrakt: fysisk 800×480 logisk panel, men faktisk passepartoutåpning observert som **x=58..737, y=39..474**. F3 har celle/viewport-intersection; eldre adaptiv renderer og web-Lab har ikke bevist pikselparitet med dette utsnittet.

**Viktig skille:** Tabellen nedenfor er en **kildeberegnet familieklassifikasjon** med normal tilgjengelig Date-state og nominell `colSpan*200 × rowSpan*120`, ikke resultatet av skjermbilder eller end-to-end rendering. Studio og firmware har *parallelle* regler, ikke en delt kodeimplementasjon. Lik familie betyr **ikke** pixel-perfect eller identisk innhold/typografi.

## 2. Alle 16 ruteformer — faktisk kildebasert nåsituasjon

| Grid | Nominelle px | Beregnet Date-familie i Studio / adaptiv firmware | Faktisk rute i Studio | Faktisk firmware uten F3 / med opt-in F3 |
| --- | ---: | --- | --- | --- |
| **1×1** | 200×120 | micro / micro | responsive | adaptive / adaptive |
| **1×2** | 200×240 | stack / stack | responsive | adaptive / adaptive |
| **1×3** | 200×360 | stack / stack | responsive | adaptive / adaptive |
| **1×4** | 200×480 | stack / stack | responsive | adaptive / adaptive |
| **2×1** | 400×120 | horizontal / horizontal | responsive | adaptive / adaptive |
| **2×2** | 400×240 | stack / stack (familiesammenligning kun) | **legacy** | medium legacy / **F3 Date** |
| **2×3** | 400×360 | stack / stack | responsive | adaptive / adaptive |
| **2×4** | 400×480 | calendar-split / calendar-split | responsive | adaptive / adaptive |
| **3×1** | 600×120 | horizontal / horizontal | responsive | adaptive / adaptive |
| **3×2** | 600×240 | calendar-split / calendar-split | responsive | adaptive / adaptive |
| **3×3** | 600×360 | calendar-split / calendar-split | responsive | adaptive / adaptive |
| **3×4** | 600×480 | expanded / expanded | responsive | adaptive / adaptive |
| **4×1** | 800×120 | horizontal / horizontal (familiesammenligning kun) | **legacy** | small legacy / **F3 Date** |
| **4×2** | 800×240 | calendar-split / calendar-split (familiesammenligning kun) | **legacy** | large legacy / large legacy |
| **4×3** | 800×360 | calendar-split / calendar-split | responsive | adaptive / adaptive |
| **4×4** | 800×480 | expanded / expanded (familiesammenligning kun) | **legacy** | XL legacy / XL legacy |

Konklusjon: **16/16** familieklassifikasjoner kan regnes ut med eksisterende kildebeslutninger (samme familie på nominell geometri), men **bare 2/16** har eksperimentell *ny* typografi på F3. **4 ankerformer er bevisst ikke direkte samme Studio-adaptive-kodebane**; ved visuell QA må faktisk dispatch sammenlignes. Alle lovlige custom-former skal fortsatt godtas, inkludert 1×1 uten krav om 2 m-lesbarhet når cellen fysisk er svært liten.

## 3. Konkrete gap / avgjørelser før første videre kode

1. **1×1 innholdsparitet:** Studio `dateComposition` kan gi `showMonth=true` for 200×120 micro fordi `height>=105`; gammel fysisk `drawAdaptiveDate` micro tegner bare dag + ukedag. Begge kalles «micro», men deklarert innhold er forskjellig. Behold **dag**, legg ukedag bare der den faktisk passer; måned/år er ikke garantert på 1×1. Løs dette i **R2** med eksplisitt parity-test, ikke via global fontbytte.
2. **Ekte viewport vs nominell celle:** fysisk øvre 4×1 har bare ca. **81 px synlig høyde** når cellen ligger på første rad. Hvis en fremtidig algoritme ukritisk klassifiserer **etter beskåret synlig høyde**, blir denne 4×1 feilaktig «micro» selv om ønsket visuelt anker er horisontalt. **Fastsett først ønsket familie ut fra celleform/komposisjon; deretter mål og planlegg hver glyph i cellens *synlige* og polstrede del.** Ved for lite synlig areal: kontrollerert mindre innhold / fontrolle / legacy fallback — aldri tegn bak matte eller over naboceller. Det samme gjelder alle fire 2×2-hjørner.
3. **Parallelle layoutbeslutninger:** `dateComposition/dateLayout` (Studio) og `drawAdaptiveDate` (firmware) er like i grov grammatikk, men ikke én felles kilde. Bevar semantiske nøkkelord og snapshots/test-tabell i R2/R3; ikke påstå pixelparitet før fysiske pikselmålinger.
4. **Typografiske roller må måles i px, ikke gjettes fra pt:** Fraunces72/48 for korte dato-heroer der det passer; DM Sans24/18 for viktig dag/måned/år; eksisterende frys/FreeSans fallback kun etter tydelig policy. Ikke bruk 9 px som skjult standard for uleselig primærinfo. `planLine` må godkjenne *alle* vesentlige glyph-bokser før en ny komposisjon tegnes, ellers returner fallback uten halvveis ny layout.
5. **Datoens fakta/funksjoner:** timezone, fullformat, kalender, uketall, helligdager og fallback ved manglende tid skal fortsatt fungere; endre bare opt-in presentasjon. Eksisterende kalender-split på 3×2, 3×3, 4×2, 4×3, 2×4 og expanded på 3×4/4×4 må ikke erstattes med én dato som overskriver nyttig kalender.
6. **F1/F2/F3 er fortsatt draft**, rammen har rapportert `v2.7.3`; nøyaktig kjent god flashbinær / fysisk rollback er **ikke verifisert**. Ikke flash, merge, OTA eller begynn på illustrasjoner som følge av R1.

## 4. R2–R4 foreslått arbeidsrekkefølge, én familie per deloppgave

- **R2A — mikro 1×1:** éntydig essensiell dato (dag) med ukedag når den får plass. Definer mikro-ink policy mellom Studio og fysisk; fysisk posisjon 0..3 i begge akser / viewport-clip; Dark/Light, normal/lang/extreme/empty, ÆØÅ.
- **R2B — smal 1×2 og lav 2×1:** prøv henholdsvis vertikal og horisontal Fraunces+DM-grafikk i egne små kodeoppgaver; ikke hardkod per geometri. Mål om 72/48px hero passer, og bruk rolletilpasset fallback. Alle 16 geometrier beholdes gyldige.
- **R3 — resterende familier:** ta `1×3,1×4,3×1`, `2×3,3×2,3×3`, `2×4,3×4,4×2,4×3,4×4` familievis, og behold F3-anerkjent 4×1/2×2 som referanse. Kalenderfunksjoner testes før ren estetikk.
- **R4 — valgfrie illustrasjoner etter Date-layout/typografi-QA:** start motivforslag i **4×3 og 4×4** der restareal *målt* etter dato+kalender+helligdager er stort nok; undersøk `3×4` og `2×4` kun ved plass. Elegante, kunstneriske botaniske/kystmotiver; 1-bit skarpe streker; ikke grått rasterkorn; ingen illustrasjon på minimalformene som default. Ingen automatisk tilfeldige variasjoner ved hver refresh.
- **Surf forblir fullstendig frosset:** ingen endringer i `ModuleSurf.cpp`, `ModuleSurf.h`, `SurfAdaptivePolicy.h` eller `app/lib/surfResponsive.mjs`. Én fysisk smoke-test ved eventuelle framtidige delte renderermodifikasjoner før rollout, **ikke** en ny Surf-bildematrise nå.

## 5. Hva R1 faktisk beviser / neste verifisering

- [x] Kildeinventar for 16 former og fysisk/lab dispatch.
- [x] Klassifikasjon på nominelle pikselmål (beslutningsreglene konsultert) og konkret 1×1/viewport-gap.
- [x] Plan for F3R/R2 smal/mikro, QA, framtidige illustrasjoner, Surf-frys.
- [ ] Faktiske Font-GFX-inkrektangler og compositional screenshots på **alle 16** med full Date-data, både Light/Dark — **R2/R3**.
- [ ] Kjørbar automasjon for familie-/content-paritet på fysisk og Studio — **R2/R3**.
- [ ] Sikker flashed binær / fysisk 1–2m / panelbekreftet Date/Fraunces-versjon — **separat rollback/QA-gate**.

**Dette dokumentet er kun et source-audit og en arbeidskontrakt. Ingenting ble endret på rammen eller i aktiv modulrenderer.**
