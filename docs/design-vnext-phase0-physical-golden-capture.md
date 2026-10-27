# RE:MIND Design vNext — 0E fysisk golden-opptak

**Status: OPPTAK AVVENTER. Ingen fysisk golden eller kjent god flash-binær er verifisert i denne PR-en.**
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
| P0 | Nåværende Pyramid, Date/News/Reminders/Weather:1 **hvis bekreftet på enheten** | to 4×1 + to 2×2 | Dark | fysisk foto + optional Mirror | **AVVENTER** |
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
- **Statusgrense:** #1430 og fase 0 i #1429 forblir åpne til de fysiske opptakene, fontproveniens og rollback-identitet er verifisert. Denne filen er bare forberedelsen; ingen golden-bilder er levert.
