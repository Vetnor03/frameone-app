# RE:MIND vNext — R2A: 1×1 Date i Fraunces + DM Sans

**Status 27.10.2026:** isolert eksperiment oppå [F3 #1434](https://github.com/Vetnor03/frameone-app/pull/1434). Tråd [#1435](https://github.com/Vetnor03/frameone-app/issues/1435). F1/F2/F3 er fortsatt egne drafts. **Standard- og F3-only-firmware har R2A AV. Ingen flash, merge eller OTA.**

## Ett tydelig design, 16 posisjoner

- Formen **1×1** er logisk `200×120` panelpiksler, men den synlige åpningsmargen er **x=58..737/y=39..474**. Ved ytterkanter er brukbar 1×1-småflate smalere/lavere. Komposisjonen bruker celle∩åpning og 6px X/4px Y padding.
- **Hovedinformasjon:** stort, sentrert dagstall i **originale Fraunces72**; når synlig høyde ikke tillater dette (typisk øverste rad) velges **originale Fraunces48** med samme senter-/inkberegning. Hvis ingen av dem passer, behold gammel Date uten halvveis tegning.
- **Underordnet informasjon:** ukedag i **originale DM Sans18**, små kapitaler (ASCII uppercase, uten å endre datakilden) under dagstallet med 3px gap. Teksten reserverer bare 22px når dens virkelige bitmap-bounds passer; ellers fjernes ukedagslinjen og dagen tar den synlige flaten. Ingen år/måned/kalender/illustrasjon i 1×1 som standard.
- F2 `EditorialText::planLine` beregner faktisk bokstavink, negative bearings og baseline før `drawDatePreviewLine`; komposisjonen planlegges før første display-tegning. **Ingen nye tekst-/tema-/globalfont-regler.**
- `tryDrawEditorialMicroDatePreview` returnerer `false` for alle andre celler enn `CELL_ADAPTIVE` med `colSpan=1,rowSpan=1`; denne har derfor **ingen effekt** på de 15 andre geometriene. F3 sine to godkjente designprototyper (4×1,2×2) er uendret.

## Av/på uten risiko

- `REMIND_R2A_DATE_MICRO_ENABLED=0` med mindre den **egne** `alfred_v1_2_date_micro_preview`-profilen er valgt. Den arver F3-fontmotoren og setter `-DREMIND_R2A_DATE_MICRO_ENABLED=1`. Byggefeil hvis noen aktiverer R2A alene uten F3.
- Standard `alfred_v1_2`, `alfred_v1_2_date_preview` og Arduino IDE-utgaven tegner **ikke** R2A. Endringen er utviklingskode, **ikke** en endring i brukernes skjermbilder.
- Ingen backend/app/Mirror-justering i denne oppgaven. **Åpent kjent Studio-gap:** `dateComposition` kan indikere månedsnavn i 200×120 mikro, mens fysisk mikro prioriterer dag/ukedag; en opt-in Studio-preview må vurderes separat etter fysisk estetisk review. Ikke hevde Lab/panel-paritet.

## Verifikasjonsmatrise

- [x] `pytest -q frame/tests`: **135 passed** i [Actions #40541283480](https://github.com/Vetnor03/frameone-app/actions/runs/40541283480), inkludert `test_date_editorial_micro.py`, med **3 472** posisjons-/datokombinasjoner basert på originale bitmap-glyphs.
- [x] `pio run -d frame -e alfred_v1_2` standard **PASS** — 1 571 385 B flash / 123 008 B global RAM.
- [x] `pio run -d frame -e alfred_v1_2_date_preview` F3-only **PASS** — 1 634 945 B flash / 123 008 B global RAM.
- [x] `pio run -d frame -e alfred_v1_2_date_micro_preview` **med R2A=1 PASS** — 1 659 293 B flash / 123 008 B global RAM.
- [x] Diagnose, legacy ESP32 og Arduino CLI **PASS**, begge GitHub Actions-jobber **success**.
- [x] F3-only → F3+R2A = **+24 348 B flash / +0 B global RAM**; standard → F3+R2A = **+87 908 B flash / +0 B global RAM**. Runtime stack/heap og faktisk brukeropplevelse er ikke målt.
- [x] PR-diff: kun Date, ny separat profil, CI, test og dokumentasjon. Alle fire Surf Git blob-SHA-ene **byte-identiske** med fase-0-frysen.
- [ ] Visuell review av den faktiske 1-bit-komposisjonen i Light/Dark og 1×1 ved alle ytterkanter. **Fysisk flash og 1–2m-test avventer bekreftet rollback** (ikke dekkes av grønn CI).

**Ikke gå videre til R2B, kalender eller dekor i denne PR-en.** Neste steg etter verifisert kildekodebygg er en liten visuell review av 1×1, deretter separat R2B for 1×2 og 2×1. **Illustrasjoner for store Date-layouts er fortsatt planlagt i R4** — ikke flyttet eller glemt. Surf forblir frosset.

## Verifisert code-head (arkivering)

Source/test/head før denne dokumentasjonsoppdateringen: commit `35dd845d90b3d44c8d155bb4a5957e83a58dd672`, [firmware Actions #40541283480](https://github.com/Vetnor03/frameone-app/actions/runs/40541283480) **completed: success** 27.10.2026. Testene er kilde-/ABI- og byggtester. De er **ikke** visuell e-paper-godkjenning; rollback av den allerede flashede v2.7.3-binæren forblir uverifisert. PR er fortsatt draft og off-by-default.
