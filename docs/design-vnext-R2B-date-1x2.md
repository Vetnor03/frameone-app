# RE:MIND Design vNext — R2B/1: Date 1×2 (vertikal), opt-in

**Status 27.10.2026:** Kildekandidat under [#1435](https://github.com/Vetnor03/frameone-app/issues/1435), stablet på [R2A draft #1437](https://github.com/Vetnor03/frameone-app/pull/1437) → F3 #1434 → F2 #1433 → F1 #1432. **Ikke merget, OTA-publisert eller flashet.** Standardfirmware, F3-only og R2A mikro er uendret.

## Kode og komposisjon

- Bare `frame/src/modules/ModuleDate.cpp`, kontrollert av ny `REMIND_R2B_DATE_TALL_ENABLED` (**0 som default**) i 1×2 `CELL_ADAPTIVE` med `colSpan=1,rowSpan=2`. Ingen andre Date-størrelser aktiveres. `alfred_v1_2_date_tall_preview` er egen ekspisitt PlatformIO-build med F3 på og R2A av, aldri standard- eller OTA-build.
- Både tekst og egne regioner planlegges **før tegning**: år (bare når faktisk innvendig høyde ≥205 px), måned, stor datoverdi og ukedag. Fraunces72 for hovedtallet, fallback Fraunces48 bare hvis glyph ikke får plass; DM Sans24 → DM Sans18 for måned og ukedag ved smale celler; år DM Sans18. Ingen vilkårlig 9px-løsning.
- Innholdet beholdes: eksisterende `safeMonth`, `safeWday`, korrekt dag/år, F2-normalisering. Ingen nye dato-, tidssone-, kalender-/helligdagsdata. For 1×2 gir legacy adaptiv kalender normalt ingen kalender; kalenderfunksjoner for større former skal bevares når de kommer senere.
- Gjør først `Cell∩(x=58..737,y=39..474)` slik at topp/bunn/venstre/høyre ligger innenfor passepartoutåpningen. Deretter 10px horisontal/vertikal margin, 8px mellom linjeregioner og 2px ink-padding innenfor regionene.
- F2 `EditorialText::planLine` kontrollerer fontens reelle ink-bounds og kursorkoordinater. Alle obligatoriske linjer må passe eller `tryDrawEditorialTallDatePreview` returnerer false **uten å tegne**; eksisterende Date renderer blir brukt. År vises kun når romslig. Ingen global font, tema, wrapping, app, nettverks- eller Surf-endring.

## Verifiserbare grenser

- [ ] 31 248 *(4 kolonner ×3 mulige startrader ×31 dagstall ×7 ukedager ×12 måneder)* faktiske GFX glyph-bounds-situasjoner passer i synlig aperture og uten innbyrdes overlapp — kjør `pytest -q frame/tests`.
- [ ] `pio run -d frame -e alfred_v1_2_date_tall_preview` (R2B enabled) grønt.
- [ ] Standard Alfred, F3-only, R2A-only, refresh-diagnostikk, legacy ESP32 og Arduino CLI bygger grønt uten at R2B aktiveres.
- [ ] Ingen Surf source-blob eller annen modul endret; PR-diff begrenset til Date, PIO, CI, docs og test.
- [ ] Statisk flash/RAM mot F3/R2A-baser når firmwarekompilering gir konkrete tall. Dette beviser **ikke** fysisk RAM/strømforbruk.
- [ ] Visuell skarphet/komposisjon i reell Dark/Light, 1–2 meter, samt mattekant – **fysisk prøve krever identifisert, fungerende rollback-binær**. Ingen flashing av kjent v2.7.3 før dette er løst.

## Prosjektfortsettelse

**Neste lille oppgave** etter R2B/1 kilde- og byggeverifisering: separat **R2B/2 2×1 horisontal Date-preview**. Deretter større responsive familier; botaniske/kunstneriske illustrasjoner beholdes som **R4 etter typografi- og kalender-QA**, særlig 4×3/4×4. Surf er ikke del av font- eller designtilpasningen.

**Statusflagg for brukeren akkurat nå: FLASH: NEI**. Denne testkoden er ikke aktiv i default firmware og ingen verifisert fysisk rollback er etablert.
