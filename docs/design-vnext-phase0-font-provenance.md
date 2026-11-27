# RE:MIND vNext — fase 0 fontproveniens (fysisk skjermtest 6)

**Status 27.10.2026: originalt GFX-bitmap-header gjenfunnet og inspeksjon BESTÅTT; eksakt upstream TTF/font-build-oppskrift og faktisk flashet SHA fremdeles uavklart.** Under [#1430](https://github.com/Vetnor03/frameone-app/issues/1430), master [#1429](https://github.com/Vetnor03/frameone-app/issues/1429), PR [#1431](https://github.com/Vetnor03/frameone-app/pull/1431). **Ingen font er installert i produksjonsrenderer. Ingen Surf-kode er endret.**

## 1. Gjenfunnet historisk kilde, ingen rekonstruksjon

I brukerens private ChatGPT-filbibliotek finnes **`RE-MIND-Fancy-Fonts-Arduino-IDE.zip`** opprettet 25.10.2026 ca. 16:15 UTC (397 105 bytes, SHA-256 `32a4191d457abcbe7358da4bb60c63320042d7937ac992f5beff762f9221ee73`). Arkivet er kilden til seks-siders Arduino-diagnostikken som den godkjente «skjerm 6» viser til, basert på dens interne sidekodedefinisjoner. **Arkivet og fontfilene ligger ikke i offentlige GitHub og skal ikke kopieres inn i docs eller som del av denne PR.**

Verifiserte interne ZIP-stier og filidentiteter:

| Fil | Bekreftede observasjoner | SHA-256 |
| --- | --- | --- |
| `frame_v2.5.1/EditorialCandidates.h` | 883 948 bytes ferdige native GFX 1-bit glyphs, seks custom GFX-fontobjekter, eksplisitt SIL OFL 1.1-tekst | `e137146a5370a2dca70113a110d40b7a2e9638dfdb4228f733ed4d011fc1769a` |
| `frame_v2.5.1/TypographyAudit.cpp` | 6 sider ved aktiv kandidatfont-flag; side 5 Instrument Serif+DM, side 6 Fraunces+DM | `553e8470074d2fe8656f06be17506ab80c651cb3e097aad1a2c92953d6f81675` |
| `frame_v2.5.1/Config.h` | `TYPOGRAPHY_AUDIT_ENABLED=1`, `TYPOGRAPHY_CANDIDATE_FONTS_ENABLED=1` i **denne testkopien** | `23952e273a441d427628fedc324a977d5ca6b9a0e12c2251bd7682f5c6033829` |

Dette er **faktiske fontbitmap-bytes** fra arkivet, ikke oppskalerte mockups eller eksterne nettfonter. Opprinnelig fysisk flash-logg/buildhash ble ikke hentet fra enheten; koblingen fra ZIP til brukers godkjente foto er derfor historisk/teststrukturell, ikke kryptografisk bevist som samme flashed binary.

## 2. Skjerm 6: eksakt kode og størrelsesroller fra den gjenfunne testkopien

`TypographyAudit.cpp` har `pageNewType(true)` for **«RE:MIND | WARM FONT 6/6»**. Rutinen velger:

- `RemindFraunces72` (display, ca. 72px bitmap-design) og `RemindFraunces48` (heading, ca. 48px bitmap-design).
- `RemindDM24` og `RemindDM18` for tekst. Denne *historiske testpakken* hadde ikke komplette DM Sans 12/16/24-px-produksjonstokens; de omtales i **senere** separate testgeneratorer.
- Tegnprøver: `oktober`, `Æ Ø Å  æ ø å`, norske ord og linjen som viser DM Sans og serif-størrelsene. Kandidatene rasteriseres uten `setTextSize`-oppskalering (`setTextSize(1)`).

Samtlige fire godkjente GFX-fontobjekter har **224 glyph-indekser** (hex `0x20–0xFF`) og egne, ikke-null målinger/bildebokser for `Æ Ø Å æ ø å`. Observert `GFXfont.yAdvance` fra metadata: Fraunces 72 → 92, Fraunces 48 → 62, DM Sans 24 → 34, DM Sans 18 → 26 **fysiske font-bitmap-metrikkenheter (pixler)**. Disse tallene må **ikke** forveksles med nominell pt-størrelse eller faktisk kapitalhøyde på e-paperet.

Sider 1–4 er eksisterende FreeSans-/FreeSerif-kalibrering, side 5 har `RemindInstrument72/48` og DM Sans, side 6 har Fraunces og DM Sans. **Surf bruker ingen av disse nye fontene.**

## 3. Hvorfor dette er bedre enn de senere ZIP-testene

Separate historiske pakker finnes også i brukerbiblioteket:
- `RE_MIND_Real_Fraunces_DMSans_Test.zip` (25.10): inkluderer `prepare_fonts.py`, `PREPARE_FONTS.bat`, og instruks for nedlasting fra Google Fonts. **Ingen TTF eller generert `AuthenticFonts.h` bundlet.** Bruker egne fontstørrelser, ikke automatisk pixelidentisk med skjerm 6.
- `RE_MIND_Complete_Design_Test_Real_Fonts.zip` (26.10): generator for flere Fraunces 72/48/36/30px og DM Sans 24/16/12px; **ingen TTF eller genererte ferdigglyphs bundlet**. Referanse for målrollene, ikke bevist kilde til skjerm 6.
- `RE_MIND_Lab_Pyramid_Real_Font_Test.zip` (27.10): Windows-skript som henter TTF fra **andre** repoer og gjør en **statisk 800×480 snapshot-bitmap**; eksplisitt **ikke** produksjonens dynamiske tekstrenderer. Den kan ikke erstatte originale GFX-glyphs.

## 4. Åpne bevis og avgrenset oppfølging

**Nå oppfylt:** Faktisk skjerm-6-tekstgeometri, bitmapobjekter, charset, versjonert zip-metadata og arkiv-/fil-hashes er dokumentert, og prøveglyph for norsk finnes i selve GFX-dataene. Det er **ikke** nødvendig å generere nye fonter fra hukommelsen for å vite hvordan skjerm 6 var tegnet.

**Fortsatt ukjent:** eksakt kilde-TTF commit/versjon, variabelakser/optisk størrelse/vekt, rasterizer- og hinting-konfigurasjon, generator-scriptet for **akkurat dette** `EditorialCandidates.h`, eventuelt lovpålagt OFL-lisensfil/attribusjon og faktisk flashed fonttest-binary med hash. Headeren inneholder OFL-forfatternavn, men det beviser ikke eksakt TTF-kilde. **Ikke oppgi generatorene fra 25.–26.10 som opprinnelig byggeoppskrift uten byte-for-byte bekreftelse.**

**Neste selvstendige oppgave, ikke startet:** utforme produksjonsfontmotor med deterministisk bygg, korrekt fontlisens/glyphdekning og liten minneprofil, ved å bruke de gjenfunne bytes som visuell referanse og holde Surf fullstendig utenfor. Før faktisk firmware-flash må produksjonsrollback være sikker og **én fysisk Surf-smoke-test** gjøres etter endringer i felles tekst-/layoutkode og før utrulling. Ikke flere Surf-bilder krevd i fase 0.
