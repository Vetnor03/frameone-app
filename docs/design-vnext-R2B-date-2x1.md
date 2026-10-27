# Design vNext — R2B/2 Date 2×1: horizontal Fraunces + DM Sans preview

**27.10.2026 · DRAFT · FLASH: NEI.** Stacked on [R2B/1 1×2 PR #1438](https://github.com/Vetnor03/frameone-app/pull/1438) → R2A #1437 → F3 #1434 → F2 #1433 → F1 #1432. [Responsiv Date tracker #1435](https://github.com/Vetnor03/frameone-app/issues/1435), master #1429.

## Designkontrakt

- **Én ny geometri:** kun `CELL_ADAPTIVE`, `colSpan=2`, `rowSpan=1`, normalt 400×120 panelpiksler. Ingen oppdatering av de andre 15 Date-størrelsene eller andre moduler.
- **Rolig horisontal komposisjon:** Fraunces72 gir dagstall som *hero* til venstre (fallback Fraunces48 ved manglende plass); måned og ukedag får to separate DM Sans24-felt til høyre (DM Sans18 kun ved faktisk fontfit-behov). År i DM Sans18 er valgfritt og vises bare hvis synlig høyde ≥100 px; ikke på øverste rad bak passepartouten.
- **Panel og fysisk synlig område:** alle 12 plasseringsmuligheter (tre startkolonner × fire rader) beregnes som `Cell ∩ [58,738)×[39,475)` før padding. Behold dagsbildet stort selv i 81px synlig øverste rad. Utfør `EditorialText::planLine` for **alle** fakta før første draw-kall; ingen ordkutt, overlapp, halvt nye layouts eller global fontbytte.
- **Funksjonell fallback:** hvis F2-mål ikke passer, returner `false` før draw og behold eksisterende `drawAdaptiveDate` som fallback. `Theme::ink()` og dagens kontekstdata beholdes; kalender, helligdager, tidssone og backend berøres ikke.
- **Ikke dekor nå.** Botaniske Date-motiver utredes i **R4** etter full typografi-/kalender-QA for store geometrier, uten Surf-endringer.

## Kompilasjonsprofil og beskyttelse

`REMIND_R2B_DATE_WIDE_ENABLED=0` ved normal kompilering. Nytt isolert `alfred_v1_2_date_wide_preview` setter dette til 1 og arver F3-fontmotoren, men **aktiverer ikke** 1×1 eller 1×2. Kilde gir kompilatorfeil hvis R2B/2 aktiveres uten F3. Standard `alfred_v1_2`, Arduino IDE, F3, R2A og R2B/1 forblir nøyaktig sine respektive opt-in profiler.

## Verifisering

- [ ] Native `pytest -q frame/tests` inkl. 2×1-regresjon og F1/F2/F3/R2A/R2B/1.
- [ ] Alle **12 × 31 × 7 × 12 = 31 248** 2×1 plasserings-/dato-/ukedag-/månedsvarianter med original GFX ink-bounds og ingen tekst utenfor matte/annen celle.
- [ ] Standard Alfred, F3-only, R2A-only, R2B/1-only, **R2B/2-enabled** og audit/legacy PlatformIO bygger.
- [ ] Arduino IDE (standard, **R2B/2 off**) bygger.
- [ ] Dokumenterte flash/RAM-tall: standard, R2B/1 og R2B/2. Ikke forveksle PIO kompilering med fysisk bruk.
- [ ] PR-endringssett kun Date, separat buildprofil, CI, tester og dokument; alle fire Surf fingerprint-hasher uendret.
- [ ] Light/Dark/fysisk 1–2m kvalitet og mattehjørner **IKKE** testet. Før dette: known-good `v2.7.3` binær/rollback **må** verifiseres. Ikke flashe med kun PR build.

**Neste:** separat visuell kvalitetsgjennomgang av mikrostørrelser og implementerte bred/smal-ankere, og deretter R3 andre størrelser. Illustrasjoner R4 er fortsatt eksplisitt åpen. **FLASH: NEI.**
