# RE:MIND Design vNext — 0E fysisk Surf-referanse (forenklet frysepolicy)

**Status: P0 Pyramid Dark og S2 Surf MEDIUM Dark er mottatt som private fysiske foto 27.10.2026 (firmware 2.7.3 oppgitt av eier tidligere). S1/S3/S4 er VALGFRIE ekstra foto, ikke fase-0-blokkere; trygg rollback/eksakt binær og fontproveniens gjenstår.**
Under [#1430](https://github.com/Vetnor03/frameone-app/issues/1430), master [#1429](https://github.com/Vetnor03/frameone-app/issues/1429). Kildekontrakt: [fase-0 ADR](design-vnext-phase0-visual-contract.md). Dette er **en opptaksprotokoll**, ikke instruks om å flashe, endre Surf eller sette pilotbrukere i testmodus.

## 1. Første opptak: eksisterende ramme, helt uten konfigurasjonsendringer

1. Ta et skarpt bilde av **det som faktisk vises på e-paperet nå**, inkludert hele det synlige panelområdet; mest mulig rett forfra, jevn belysning, uten gjenskinn. Ikke bruk skjermbilde fra nettleser som fysisk dokumentasjon.
2. Ta gjerne i tillegg et bilde på ca. 1–2 m som dokumenterer faktisk lesbarhet. Behold originalfilene, ikke del en kraftig komprimert variant.
3. Registrer **faktisk** firmwareversjon og build-identitet fra oppstart/Serial eller eksisterende verifiserbar firmware-build hvis tilgjengelig. `main`-SHA `5718eeae647655735298bdfef84723ab6e8a8cec` er **kun kilde-snapshot**, ikke bevist flash. Hvis hash/binær ikke finnes: skriv `ukjent`, aldri erstatt med tipset commit.
4. Registrer HW-revisjon, fysisk tema, valgt preset/custom geometribeskrivelse, dato/klokkeslett, og om USB-strøm er tilkoblet. Ingen credentials, tokens, Wi-Fi-passord, private kalenderhendelser eller proprietære koblingsdata skal legges i offentlige GitHub-vedlegg. Sladd private detaljer før offentlig opplasting.
5. Registrer hvor original firmware-binær oppbevares, samt SHA-256 **når faktisk fil foreligger**; arkiver den privat. Det er ingen grunn til å reflashe en fungerende ramme for å samle første bilde.

## 2. Første minimumsmatrise

For Surf skal gjeldende produksjonsuttrykk **fryses**, ikke gjenskapes ved å redesigne modulen. Begynn med eksisterende oppsett og gjennomfør eventuelle midlertidige layout-/temaskifter **kun etter at nåværende konfig er lagret og bevisst godkjent for endring**. Gjenopprett den eksakte opprinnelige konfigurasjonen etterpå. Ikke manipuler live Surf-data, scoring eller tekst bare for å få et pent bilde.

| ID | Fysisk scenario | Logisk panelområde | Tema | Opptak | Status |
| --- | --- | --- | --- | --- | --- |
| P0 | Faktisk Pyramid: Date/News/Reminders/Weather | to 4×1 + to 2×2 | Dark | privat fysisk foto 27.10.2026, ingen Mirror | **MOTTATT; fysisk aksept/arkivering avventer** |
| S1 | Surf SMALL | 4×1 = 800×120 | Dark | kun ved senere behov | **VALGFRITT** |
| S2 | Surf MEDIUM | 2×2 = 400×240 | Dark | privat fysisk JPEG mottatt 27.10.2026, ingen Mirror | **MOTTATT; pixel-/rollback-aksept avventer** |
| S3 | Surf SMALL | 4×1 = 800×120 | Light | kun ved senere behov | **VALGFRITT** |
| S4 | Surf MEDIUM | 2×2 = 400×240 | Light | kun ved senere behov | **VALGFRITT** |

Neste runde, **ikke en forutsetning for første opptak**, er Surf LARGE 4×2, XL 4×4 og gyldige custom 1×2, 2×3, 3×2, hver i Light/Dark. Sammenlign med samme faktiske Surf-inndata/tidsstempel der det er mulig; nye vær- eller bølgedata kan ellers gi legitime forskjeller i innhold.

**Viktig:** Aktiv Pyramid Dark er en tidligere Supabase-fixture, ikke en fersk database- eller device-avlesning. Hvis rammen viser noe annet, logg det som faktisk vises og behold konfig uendret; ikke merk det feilaktig som P0.

## 3. Metadata for hvert vedlegg (kopier inn i #1430)

```text
Scenario ID: P0 / S1 / S2 / S3 / S4
Dato, tid, tidssone:
Hardware revisjon / test device alias:
Faktisk firmwareversjon:
Flashet commit / build-ID: UKJENT inntil bekreftet
Arkivert firmware.bin SHA256: UKJENT inntil bekreftet
Layout (preset eller col,row,colSpan,rowSpan):
Theme: Dark / Light
USB: tilkoblet / ikke tilkoblet
Fysisk originalfoto (lenke):
Mirror/simulator (lenke, separat merket):
Surf-datakilde / tidsstempel (om relevant):
Testavstand / lesbarhet:
Avvik, clipping, separatorer, kontrast, tegn:
Tilbakerullet til opprinnelig konfig (hvis endret): ja/ikke aktuelt
Vurdering: AVVENTER / PASS / FAIL, med begrunnelse
```

## 4. Godkjenningsregler

- **Source-guard (allerede bestått i PR #1431):** Surf-fingerprints i `tests/design-vnext-phase0-baseline.test.mjs`. Dette beskytter bestemte kildefiler, **ikke** fysisk komposisjon ved endringer i delte tekst-/layoutlag.
- **Fysisk referanse (S2 mottatt, ikke piksel-golden):** hele Surf-modulen og dens 1-bit/tema-opplevelse må være identisk med referansen ved samme data/geometri, inkludert scorer, bølge/vind/periode, hierarki, spacing, tegn, divider og clipping. Differanser fra foto-perspektiv/belysning vurderes separat fra output; direkte pikselregresjon krever faktiske render-buffer-dumper.
- **Fonttest 6 (AVVENTER):** finn originalfiler, build-parametre og fysisk foto av godkjent Fraunces/DM Sans. Ikke start å bytte fonter basert på et nettleser-preview eller en rekonstruert font.
- **Rollback (AVVENTER):** kjent god binær og faktisk hardware/build-match må dokumenteres før fremtidig eksperimentflash. Ingen `main`-SHA eller branch regnes automatisk som kjent god.
- **Statusgrense:** Gjenstående Surf-opptak er **ikke lenger en fase-0-gate** etter eiers beslutning. P0/S2 er private mottatte referanser, og Surf-kilden er frosset. Ekte rollback-binær og fontproveniens følges opp separat. Delte designendringer krever en enkel fysisk Surf-smoke-test **før utrulling**. P0 og S2 er mottatt som private kamerafoto; **ingen** av dem er publisert i repo eller godkjent som endelig pixel-golden.

## 5. P0: mottatt fysisk Pyramid Dark, firmware 2.7.3 (27.10.2026)

**Kilde:** Originalt 1536×1152 JPEG-foto sendt av eier i privat ChatGPT-samtale 27.10.2026. Firmware `2.7.3` oppgitt eksplisitt av eier; **ikke bekreftet** mot Serial, build-ID, Git-commit eller bevart binær. Originalfilen er **ikke** offentlig delt eller versjonert i GitHub, fordi den inneholder private påminnelser/avtaledetaljer og aktuelle overskrifter. Ikke legg originalbildet i en offentlig issue/PR.

- **Originalfoto SHA-256 (JPEG, ikke panelbuffer):** `9b0ff94b4d8782dd865ed57694f6593475a89fbc4a7e05c8616a6ab656240933`; 469499 byte, 1536×1152 px. Må kontrolleres mot den samme original-JPEG-filen før bruk som bevis; hash sier ingenting om flashet binær eller rendererens pixelbuffer.
- **Fysisk komposisjon observert:** mørkt tema, Pyramid med øvre fullbredde Date, én fullbredde News-region delt i tre tekstkolonner, nederst Reminders venstre og Weather høyre; horisontale og vertikale skillelinjer. Dette samsvarer med de fire regionene i baseline-geometrien og den tidligere dokumenterte modulrekkefølgen. Individuelle private tekstinnhold er bevisst utelatt.
- **Synlig typografisk hierarki:** datoen er stor/sentrert og tydeligst; News-teksten er forholdsvis liten og tett i tre kolonner; Reminders har stor 'Today'-overskrift med betydelig tomrom, men innhold nær bunnen; Weather har temperaturer øverst, et værvarsel, et lite ikon og små nedre målinger. Fotografiets skarphet, perspektiv og lys er **ikke** et pålitelig mål på GFX-glyph-piksler, kontrast på 2 m eller eksakt fysisk bit-depth. Ingen påstand om pikselgodkjenning eller testet lesbarhet fra 1–2 m.
- **Metadata som gjenstår:** HW-revisjon, faktisk flashed commit, original firmware-binær + SHA256, USB-status, eventuell Mirror-visning og et sikkert privat arkiv av originalbildet. Ingen handlinger eller omkonfigurering ble gjort på den fysiske rammen for dette opptaket.
- **Resultat:** P0-bildet **mottatt og dokumentert**; P0 **ikke endelig golden-godkjent**. Surf S2 Dark MEDIUM er senere mottatt (se §7); S1, S3 og S4 er **VALGFRIE**. De fullstendige fase-0-gatene er åpne. Ikke flash ny kode bare for å etablere dette fotografiet.

## 6. Sporbarhet for firmware 2.7.3 — kildekode funnet, binær fortsatt ukjent (27.10.2026)

**Verifisert via GitHub-historikk, ikke fysisk Serial:** `frame/src/frame_v2.5.1.ino` setter `FW_VER = "v2.7.3"` på referansekilden i `main`. Denne tekstverdien er **ikke en unik build-identitet**: den ble allerede endret fra 2.7.2 til 2.7.3 i [commit `20b4a15f` 13.10.2026](https://github.com/Vetnor03/frameone-app/commit/20b4a15f77c5), og kom tilbake som 2.7.3 i [commit `58934de4` 26.10.2026](https://github.com/Vetnor03/frameone-app/commit/58934de485b39afbc7e4edf0f41880312fbf0ce2), etter at mellomliggende [commit `a2045a72` 16.10.2026](https://github.com/Vetnor03/frameone-app/commit/a2045a727579) satte versjonsstrengen til 2.7.2. Disse kildevariantene har ulike funksjons-/hardwareendringer til tross for identisk 2.7.3-label.

- Den nyere commit `58934de4` inkluderer særlig Alfred V4 GPIO14/TXB0108-OE oppstartssekvensering, så den er en relevant **kandidat** gitt ny PCB-historikk, men selve panelets foto og en oppgitt versjonsstreng beviser **ikke** at akkurat denne er flashet.
- På inspisert `main` finnes **ingen `public/firmware/frame-2.7.3.bin`**. Versjonerte binærfiler i repoets `public/firmware/` går til `frame-2.5.4.bin`; appens sjekk-endepunkt `app/api/device/firmware/route.ts` har `LATEST_VERSION = 'v2.5.7'`. Dette er **ikke** grunnlag for å anta at en tilsvarende 2.7.3-binær kan hentes derfra eller via OTA.
- **Ikke flash på nytt:** behold fungerende 2.7.3 på rammen, og hvis den eksakte opprinnelige lokalt eksporterte binæren finnes, arkiver den privat med SHA-256 + Arduino-/PlatformIO-profil. Dersom kun kilde finnes, kan vi bygge *en kandidat* senere, men den må ikke fremstilles som byte-identisk gjenoppretting. Sikreste neste fysiske datapunkt er en allerede eksisterende Serial build-ID/versjon hvis den finnes uten risiko for reset, og Surf-foto fra nåværende firmware.
- Fase 0-status: **FW_VER kilde-label KARTLAGT; nøyaktig flashet commit = UKJENT; byte-identisk rollback-binær = UKJENT.** Ingen endringer i firmware, OTA eller Surf er utført i denne sporbarhetsundersøkelsen.

## 7. S2: Surf MEDIUM 2×2 Dark — fysisk foto mottatt 27.10.2026

**Kilde og vern:** Eier sendte privat original-JPEG av en faktisk e-paper-ramme, 1152×1536 px, 478055 byte; SHA-256 `03fbafc77e0c387b82add27a9936581c76eb99f596740cec08f1324b96a7c3fa`. Fotofilen viser private kalenderhendelser og er **ikke** lastet opp til GitHub. Hash gjelder kamerafotoets byteinnhold, **ikke** GFX-bildedata eller firmware. Originalen må fortsatt arkiveres sikkert før varig golden-aksept.

**Hva vi faktisk kan bekrefte i fotoet:** Pyramid-geometri med øvre fullbredde Tomorrow, fullbredde News, nederst Surf venstre (**2×2 = 400×240 logiske piksler**) og Weather høyre; mørkt skjermtema. Surf viser tittel/spot **Bore** med understrekning, «Best next 4h», vurderingen «Poor to Fair», rekken av graderingsruter til venstre, «Details» på høyre side av sin Surf-celle, piler/indikatorer samt bølge-/periode-/vindinformasjon. Regionens interne inndeling og informasjonsprioritering er dermed dokumentert som **fotoreferanse**, ikke som maskinlest pixel-perfect gullstandard. Faktiske numeriske vær- og surfverdier er tidsavhengige og ikke kontraktsfestet som fasit.

**Kvalitetsbegrensninger:** Bilde er tatt på avstand og i skrått perspektiv med innendørs lys. Helt venstre kant av enkelte tekstlinjer ser nær panelkanten ut, men bilde/perspektiv alene kan ikke avgjøre om firmware faktisk klipper glyphs. Krev eventuelt et rett-på nærfoto før eksakte pixelasserts. Ingen testbuffer, paritet med Mirror, 1–2 m skriftmåling eller kontrollert gjentakelse med identiske Surf-data er levert.

**Firmware:** `v2.7.3` er tidligere oppgitt av eier ved P0; S2-fotoet viser ikke en serial firmware-logg. Dette knytter S2 til samme rapporterte testfase, **ikke** sikkert til en bestemt flashet SHA eller binær.

**Status:** **S2 fysisk referanse MOTTATT** og god nok som fase-0-visuell referanse etter eiers beslutning; Surf fortsatt **helt frosset**. Surf S1 (SMALL Dark), S3 (SMALL Light), S4 (MEDIUM Light) er **valgfrie** senere bilder. Eksakt firmware-binær og fonttest-6-proveniens er fortsatt uavklarte. Én Surf-smoke-test kreves først **etter endringer i delte rendererlags kode og før utrulling**. Ingen firmware- eller framekonfig er endret gjennom dokumentasjonsarbeidet.
