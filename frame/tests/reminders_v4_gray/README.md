# RE:MIND V4 — ekte gråtoner for Reminders (USB-test)

Dette er isolert TESTFIRMWARE, ikke produksjonskode. Ingen OTA/flash
utføres av byggingen. Firmware erstatter midlertidig app-koden ved en
eventuell senere fysisk USB-opplasting. NVS, lagret paring og Wi-Fi skrives
ikke av testprogrammet, men vanlig firmware må flashes tilbake etter testen.
IKKE bruk Erase All Flash.

**Ekte fire gråtoner:** Bruker GxEPD2_4G med egen firegrå-nivås bølgeform
for GDEW075T7, ikke dithering. Driverforfatteren opplyser at denne modellens
gråtoneeffekt er eksperimentell og kan gi ghosting. Må testes fysisk før
vi bestemmer oss for produksjonsbruk.

Skjerm: 800×480 Waveshare V2; GxEPD2_750_T7, Alfred V4 pinout,
4 MHz FSPI, GPIO12 panel power, GPIO14 level-shifter OE.
Alle full-oppdateringer; ingen grayscale partial refresh.
Krever USB tilkoblet (PGOOD_N LOW). Ingen nettverk, backend eller OTA.

**Original Reminders:** Renderingen inkluderer den samme faktiske
RemindersEditorialPreview.h fra GitHub og originale Fraunces / DM Sans
bitmap-fonter. Fixturedata er lokale. Dette tester fysisk visuell kvalitet,
ikke live-sync, Skip eller virkelig tidsregellogikk. Dersom original
renderer ville valgt fallback, vises en eksplisitt FALLBACK-melding
her, ikke en uautorisert kopi av fallbackproduksjonskoden.

## Bygg (ingen flashing)
Installer PlatformIO 6.1.18, kjør fra repoets rot:

    pio run -d frame/tests/reminders_v4_gray -e v4_gray_qa

Filen finnes i:
frame/tests/reminders_v4_gray/.pio/build/v4_gray_qa/firmware.bin

Også i GitHub Actions-testkjøring som MANUAL-USB-TEST-UNFLASHED.

## Serial Monitor — 115200 baud, Newline/LF

Kommando                  Resultat
----------------------------------------------------
levels                    Fire ekte gråtoner på skjermen
bg 0                      Hvit bakgrunn, automatisk SVART tekst
bg 1                      Lysgrå bakgrunn, automatisk SVART tekst
bg 2                      Mørkgrå bakgrunn, automatisk HVIT tekst
bg 3                      Svart bakgrunn, automatisk HVIT tekst
size 1x1 .. size 4x4      Alle 16 rektangelformer
next / prev               Bla gjennom alle 16
scene few                 2 påminnelser
scene normal              5 påminnelser
scene many                10 påminnelser
scene long                Lange tekster
scene tomorrow            Kun morgendagen
scene norwegian           ÆØÅæøå
scene empty               Tom liste
render                    Gjenta full EPD oppdatering
status                    Se valgt bakgrunn, kontrast, form
help                      Hjelp

Ved hver endring blir HELE panelbildet oppdatert via ekte 4G waveform.
Skrift, tider, overskrifter og hjelpeetiketter bruker samme
høy-kontrast fargevalg: svart på hvit/lysgrå, hvit på mørkgrå/svart.
Grå bakgrunn er ikke tegnet som svarte/hvite mønstre.

## Før manuell fysisk QA
- Eksplisitt godkjenning til USB-flash på en definert V4-testenhet.
- Ikke rør produksjonens OTA-manifest, NVS eller device settings.
- Test alle fire nivåer, mørk/lys tekst, de 16 størrelsene, flere scenarier.
- Foto av skjermen: vurder lesbarhet på 1–2 m, ghosting og tidsbruk.
- Flash tilbake vanlig produksjonsfirmware etter testen.
- Ingen merge til main uten egen godkjenning.
