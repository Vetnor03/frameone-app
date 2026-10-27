# RE:MIND Design vNext — 0E fysisk golden-opptak

**Status: P0-foto mottatt privat fra fysisk ramme 27.10.2026 (firmware 2.7.3 oppgitt av eier). Surf-golden og kjent god flash-binær AVVENTER.**
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
| S1 | Surf SMALL | 4×1 = 800×120 | Dark | fysisk foto + Mirror | **AVVENTER** |
| S2 | Surf MEDIUM | 2×2 = 400×240 | Dark | fysisk foto + Mirror | **AVVENTER** |
| S3 | Surf SMALL | 4×1 = 800×120 | Light | fysisk foto + Mirror | **AVVENTER** |
| S4 | Surf MEDIUM | 2×2 = 400×240 | Light | fysisk foto + Mirror | **AVVENTER** |

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
- **Fysisk gullstandard (AVVENTER):** hele Surf-modulen og dens 1-bit/tema-opplevelse må være identisk med referansen ved samme data/geometri, inkludert scorer, bølge/vind/periode, hierarki, spacing, tegn, divider og clipping. Differanser fra foto-perspektiv/belysning vurderes separat fra output; direkte pikselregresjon krever faktiske render-buffer-dumper.
- **Fonttest 6 (AVVENTER):** finn originalfiler, build-parametre og fysisk foto av godkjent Fraunces/DM Sans. Ikke start å bytte fonter basert på et nettleser-preview eller en rekonstruert font.
- **Rollback (AVVENTER):** kjent god binær og faktisk hardware/build-match må dokumenteres før fremtidig eksperimentflash. Ingen `main`-SHA eller branch regnes automatisk som kjent god.
- **Statusgrense:** #1430 og fase 0 i #1429 forblir åpne til Surf-opptakene, privat arkivering av P0, fontproveniens og rollback-identitet er verifisert. Ett P0-foto er mottatt i privat samtale; det er **ikke** lagt i repo eller godkjent som endelig fysisk golden.

## 5. P0: mottatt fysisk Pyramid Dark, firmware 2.7.3 (27.10.2026)

**Kilde:** Originalt 1536×1152 JPEG-foto sendt av eier i privat ChatGPT-samtale 27.10.2026. Firmware `2.7.3` oppgitt eksplisitt av eier; **ikke bekreftet** mot Serial, build-ID, Git-commit eller bevart binær. Originalfilen er **ikke** offentlig delt eller versjonert i GitHub, fordi den inneholder private påminnelser/avtaledetaljer og aktuelle overskrifter. Ikke legg originalbildet i en offentlig issue/PR.

- **Originalfoto SHA-256 (JPEG, ikke panelbuffer):** `9b0ff94b4d8782dd865ed57694f6593475a89fbc4a7e05c8616a6ab656240933`; 469499 byte, 1536×1152 px. Må kontrolleres mot den samme original-JPEG-filen før bruk som bevis; hash sier ingenting om flashet binær eller rendererens pixelbuffer.
- **Fysisk komposisjon observert:** mørkt tema, Pyramid med øvre fullbredde Date, én fullbredde News-region delt i tre tekstkolonner, nederst Reminders venstre og Weather høyre; horisontale og vertikale skillelinjer. Dette samsvarer med de fire regionene i baseline-geometrien og den tidligere dokumenterte modulrekkefølgen. Individuelle private tekstinnhold er bevisst utelatt.
- **Synlig typografisk hierarki:** datoen er stor/sentrert og tydeligst; News-teksten er forholdsvis liten og tett i tre kolonner; Reminders har stor 'Today'-overskrift med betydelig tomrom, men innhold nær bunnen; Weather har temperaturer øverst, et værvarsel, et lite ikon og små nedre målinger. Fotografiets skarphet, perspektiv og lys er **ikke** et pålitelig mål på GFX-glyph-piksler, kontrast på 2 m eller eksakt fysisk bit-depth. Ingen påstand om pikselgodkjenning eller testet lesbarhet fra 1–2 m.
- **Metadata som gjenstår:** HW-revisjon, faktisk flashed commit, original firmware-binær + SHA256, USB-status, eventuell Mirror-visning og et sikkert privat arkiv av originalbildet. Ingen handlinger eller omkonfigurering ble gjort på den fysiske rammen for dette opptaket.
- **Resultat:** P0-bildet **mottatt og dokumentert**; P0 **ikke endelig golden-godkjent**. S1–S4 Surf Light/Dark SMALL/MEDIUM **AVVENTER**. De fullstendige fase-0-gatene er åpne. Ikke flash ny kode bare for å etablere dette fotografiet.
