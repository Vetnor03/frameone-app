# RE:MIND Design vNext — F1 asset handoff (NOT YET READY TO MERGE)

Work belongs to main [#1429](https://github.com/Vetnor03/frameone-app/issues/1429), Phase-0 [#1430](https://github.com/Vetnor03/frameone-app/issues/1430). **This draft branch NOW contains the generated 4-font `RemindEditorialFonts.cpp` (508,302 byte C++ source, 27 Oct 2026).** Do not merge or flash based on this branch. No Surf or production renderer file is modified.

## Verified independently, 27 Oct 2026

- Original six-screen local source ZIP `RE-MIND-Fancy-Fonts-Arduino-IDE.zip`: SHA256 `32a4191d457abcbe7358da4bb60c63320042d7937ac992f5beff762f9221ee73`.
- Its `frame_v2.5.1/EditorialCandidates.h`: SHA256 `e137146a5370a2dca70113a110d40b7a2e9638dfdb4228f733ed4d011fc1769a`.
- Four selected fonts **only**: Fraunces72 bitmap 46,927 bytes SHA256 `f0153afa4c6bec182ac04566c0e3d21a6d5dd39905291dd585b38abf71c5d216`; Fraunces48 22,127 bytes SHA256 `1001c2bcbf3ab7756f2d9dbc3cae16167d420b7284a319fca2afa17bfe579eaa`; DM Sans24 5,732 bytes SHA256 `a3ea67d87a83b7f52811992aa28fd71f0ec735c0bda7847cf2f0f1ed971c1033`; DM Sans18 3,298 bytes SHA256 `de84365734e30c07a660fb1d2b3607ee5763d15e2ad9c69ee3882575fc8dd690`.
- All four have exactly 224 GFXglyph entries for 0x20..0xFF, valid `ÆØÅæøå`, degree and ASCII space and valid glyph-bitmap offsets. Nominal raw bitmap+glyph bytes = **84,356 bytes**, *not a measured firmware flash-size delta*. One translation unit, optional `const GFXfont*` getters, **no change to shared fonts/Surf code or Adafruit GFX defaults**.
- Upstream Fraunces and DM Sans `OFL.txt` copied complete and unchanged from `google/fonts/main/ofl/{fraunces,dmsans}`. The original 2018 copyright notice is retained. **Still validate upstream font version and generated binary license metadata before distributing production firmware.**
- Standalone GNU C++17 native compilation against Adafruit-GFX-like ABI stubs: **PASS**; font getter/metadata smoke: **PASS**; extracted definitions compared **byte-for-byte against original ZIP: PASS**. These are **not** PlatformIO or Arduino firmware builds.

## Source / reproducibility

`frame/tools/recover_screen6_fonts.py` is a developer-only deterministic recovery tool (Python standard library). It requires the matching archived ZIP on the developer computer, verifies original archive/header SHA-256, copies the exact four 1-bit GFX font definitions and checks Latin-1 glyph coverage. The tool is **not** required on pilot devices and never downloads fonts or injects secret data. The archived ZIP contains private/unreviewed diagnostic firmware and must **not** be committed wholesale.

Offline generation:
```sh
python frame/tools/recover_screen6_fonts.py /path/to/RE-MIND-Fancy-Fonts-Arduino-IDE.zip
```
The generated `RemindEditorialFonts.cpp` is now committed on this branch. Git blob SHA `ce233c113d28bf9be01bbfdfb6d9ad9cac488495` matches the Git blob SHA of the locally tested original; SHA-256 is `e533f0431d3bf1d7ba47be7be2de89b8221d828d26947c17df8fae2e3a0c5083`. The `tests/f1-original-font-assets.test.mjs` test locks those bytes, all bitmap hashes, 224-glyph Latin-1 ranges, Norwegian glyphs and official OFL license texts. GitHub Actions full Alfred/Arduino firmware build and measured ELF/map impact remain pending verification; don't mark them PASS until actual logs are reviewed. Do not change existing module renderers until separate F2/F3. Keep `RemindEditorialFonts.cpp` isolated and unused so Surf cannot inherit new assets.

## Missing F1 merge gates

- [x] Generated `RemindEditorialFonts.cpp` committed to GitHub and its Git blob hash verified identical to the tested local file (508,302 bytes).
- [ ] Actual GitHub Actions Alfred PlatformIO and Arduino build pass with the committed source; **run in progress** on this PR, result to be verified.
- [ ] Actual memory/flash map review with and without newly linked font assets.
- [ ] Verify font-license attribution in firmware distribution and source-provenance caveat.
- [x] Both OFL texts versioned; original byte fingerprint and Norwegian glyph coverage recorded.
- [x] Source-level Surf files untouched; existing frame continues on 2.7.3 with no flash.

**No real-flash rollback identity has yet been established.** F1 is not authorizing a flash or OTA.


## Transfer and CI checkpoint — 27.10.2026

- PR head added exact F1 source via GitHub contents API: commit `1663bb5da365beac32a5a320121626dc35fabf95`; identical Git blob `ce233c113d28bf9be01bbfdfb6d9ad9cac488495` confirmed via repository file metadata and local `git hash-object`.
- Added `tests/f1-original-font-assets.test.mjs` and corrected its glyph tuple expression in commit `23368978597ed23200b46e65b601dbc8e7d9bba9`.
- The local offline native compiler and 12-definition byte-for-byte source comparison **PASS**; don't conflate that with GitHub CI or physical flash.
- Official OFL text is checked in for both font families. The original source comments mention a generic OFL file; use the canonical full license copies under `frame/src/assets/fonts/licenses/`.
- Source/provenance and build-memory remain explicit gates; **no production module references any of the new font accessors**. Surf untouched.
