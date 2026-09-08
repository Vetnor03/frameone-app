# Norway waste coverage audit (2026)

> Read-only research artifact. This audit does **not** change provider routing, add adapters, probe
> addresses, or imply that an ownership interest equals statutory household-waste coverage.

## Result

| Measure | Municipalities | Share |
|---|---:|---:|
| Exact official universe | 357 | 100.0% |
| Registry `supported` rows | 15 | 4.2% |
| Registry `preview` rows | 2 | 0.6% |
| Fully implemented without a known credential block | 7 | 2.0% |
| Existing adapter, registry mapping absent | 20 | 5.6% |
| Known provider, adapter not implemented | 53 | 14.8% |
| Credential blocked (registered MinRenovasjon) | 8 | 2.2% |
| Auth gated | 1 | 0.3% |
| Provider unresolved / unknown | 266 | 74.5% |

The seven coverage statuses are mutually exclusive and total 357. “Registry supported” is a
separate implementation inventory: eight of its fifteen rows use MinRenovasjon and are therefore
shown as `credential_blocked`, not as verified working coverage. `supported` never means
`live_verified`; no live calls were made by this audit.

## Sources, scope, and confidence

The municipality universe is the repository snapshot of [SSB classification 131](https://www.ssb.no/klass/klassifikasjoner/131),
effective in 2026 and captured 2026-09-08. Every row retains the source and snapshot date. The
audit fails unless there are exactly 357 unique numbers. It also fails for an obsolete registry
number. Names were not collected from waste-provider sites.

Provider mappings are deliberately narrow. The review used provider/municipal first-party pages
linked in the matrix and the source inventory pinned in
[`THIRD_PARTY_WASTE_PROVIDERS.md`](../../THIRD_PARTY_WASTE_PROVIDERS.md). An upstream source is
evidence that a technical integration has existed—not proof that every owner municipality uses it,
or that it still works. Entries not supported by sufficiently specific evidence remain
`unknown_provider` rather than being guessed.

Important decisions:

* **HIM:** Bokn, Etne, Tysvær and Vindafjord are high-confidence candidates for the existing `him`
  family alongside registered Haugesund. The same public address/calendar surface is indicated,
  but each municipality still needs a representative live contract test before a later routing PR.
* **Stavanger (1103) and Sandnes (1108):** remain `preview` / `norconsult_unresolved`. Calendar
  parsing is known; automatic Kartverket-to-provider-property resolution is not.
* **BIR:** Askøy, Bergen, Bjørnafjorden (including Strøno), Eidfjord, Kvam, Osterøy, Samnanger,
  Ulvik, Vaksdal and Voss are `known_provider_no_adapter`. Øygarden is intentionally excluded from
  BIR household coverage and remains unknown: ownership alone is not service delegation.
* **Karmøy (1149):** is `auth_gated`; its personal calendar is behind Min side/BankID/app/PDF after
  login. This audit neither signs in nor reverse engineers authentication.
* **MinRenovasjon:** all eight registered rows are implementation-known but
  `credential_not_configured` for live verification. No catch-all probing was performed.

## Required upstream/provider review

| Source reviewed | Audit disposition |
|---|---|
| Avfall Sør | 2 `known_provider_no_adapter` |
| BIR | 10 `known_provider_no_adapter`; Øygarden excluded |
| Fosen Renovasjon | 3 registered, Osen existing-adapter candidate |
| Fredrikstad | 1 `known_provider_no_adapter` |
| GLØR | 3 `known_provider_no_adapter` |
| HIM | Haugesund registered, 4 existing-adapter candidates |
| Innherred Renovasjon | 9 `known_provider_no_adapter` |
| Iris Salten | 9 `known_provider_no_adapter` |
| Min Renovasjon | 8 registered mappings, all credential-blocked for live verification |
| MOVAR IKS | 4 `known_provider_no_adapter` |
| Oslo Kommune | 1 registered |
| ReMidt | 2 registered, 15 existing-adapter candidates |
| RfD | 6 `known_provider_no_adapter` |
| RIR | 4 `known_provider_no_adapter` |
| ROAF | 7 registered MinRenovasjon mappings |
| Sandnes / Stavanger | 2 registry previews; property resolution unresolved |
| SUM Avfall | 4 `known_provider_no_adapter` |
| Trondheim | 1 `known_provider_no_adapter` |

The current authoritative service area was checked against the first-party URL attached to each
matrix row. Where the provider page did not prove a municipality strongly enough, the row was not
assigned. “Adapter exists” means RE:MIND implementation exists; “upstream adapter” means only that
the pinned third-party source contains an integration worth evaluating.

## Provider-family priority

Ranking uses municipalities unlocked first, then expected effort and evidence confidence. It is a
planning aid, not a routing recommendation.

| Rank | Category | Batch | Potential unlock | Why |
|---:|---|---|---:|---|
| 1 | A — existing RE:MIND adapter | ReMidt registry validation | 15 | Existing `renovasjonsportal` family; validate municipality/property acceptance. |
| 2 | B — upstream adapter to port | BIR | 10 | Largest reviewed, tightly evidenced first-party service group. |
| 3 | B — upstream adapter to port | Innherred Renovasjon | 9 | One known upstream provider family across nine reviewed municipalities. |
| 4 | A — existing RE:MIND adapter | HIM registry validation | 4 | High-confidence same-provider expansion; requested known gap. |
| 5 | B — upstream adapter to port | Iris Salten | 9 | Shared upstream adapter and provider group. |

After those, assess RfD (6), RIR (4), MOVAR (4), SUM (4), GLØR (3), Avfall Sør (2), and the
single-municipality Fredrikstad and Trondheim sources. Osen is a separate one-municipality Fosen
registry-validation batch. Auth-gated Karmøy is category E. Shared platforms should only be
promoted to category C after contract comparison; this audit does not infer common routing merely
from similar websites.

## Reproduce

```bash
node scripts/audit-waste-coverage.mjs
node scripts/audit-waste-coverage.mjs --write-docs
node --test tests/audit-waste-coverage.test.mjs
```

`--write-docs` replaces only the generated matrix between the markers below.

## Municipality matrix

<!-- AUDIT_MATRIX_START -->
| Municipality | County | Provider / family | Registry | Coverage | Adapter | Live verification | Evidence / notes |
|---|---|---|---|---|---|---|---|
| 0301 Oslo | Oslo | Oslo kommune / `oslo` | supported | `supported` | implemented | not_tested | [source](https://github.com/mampfes/hacs_waste_collection_schedule/tree/1339b9b5b708f4ac825d91c274613b6647a29d68/custom_components/waste_collection_schedule/waste_collection_schedule/source) |
| 1101 Eigersund | Rogaland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1103 Stavanger | Rogaland | Stavanger kommune / `norconsult_unresolved` | preview | `preview` | parser_known_resolution_missing | not_tested | [source](https://github.com/mampfes/hacs_waste_collection_schedule/tree/1339b9b5b708f4ac825d91c274613b6647a29d68/custom_components/waste_collection_schedule/waste_collection_schedule/source) Provider calendar parser known; automatic Kartverket-to-property-ID resolution unresolved. |
| 1106 Haugesund | Rogaland | Haugaland Interkommunale Miljøverk / `him` | supported | `supported` | implemented | not_tested | [source](https://github.com/mampfes/hacs_waste_collection_schedule/tree/1339b9b5b708f4ac825d91c274613b6647a29d68/custom_components/waste_collection_schedule/waste_collection_schedule/source) |
| 1108 Sandnes | Rogaland | Sandnes kommune / `norconsult_unresolved` | preview | `preview` | parser_known_resolution_missing | not_tested | [source](https://github.com/mampfes/hacs_waste_collection_schedule/tree/1339b9b5b708f4ac825d91c274613b6647a29d68/custom_components/waste_collection_schedule/waste_collection_schedule/source) Provider calendar parser known; automatic Kartverket-to-property-ID resolution unresolved. |
| 1111 Sokndal | Rogaland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1112 Lund | Rogaland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1114 Bjerkreim | Rogaland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1119 Hå | Rogaland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1120 Klepp | Rogaland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1121 Time | Rogaland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1122 Gjesdal | Rogaland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1124 Sola | Rogaland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1127 Randaberg | Rogaland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1130 Strand | Rogaland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1133 Hjelmeland | Rogaland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1134 Suldal | Rogaland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1135 Sauda | Rogaland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1144 Kvitsøy | Rogaland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1145 Bokn | Rogaland | HIM / `him` | unmapped | `adapter_exists_missing_registry` | implemented_unmapped | not_tested | [source](https://him.as/om-him/) High-confidence: same statutory provider and existing HIM address/calendar contract. |
| 1146 Tysvær | Rogaland | HIM / `him` | unmapped | `adapter_exists_missing_registry` | implemented_unmapped | not_tested | [source](https://him.as/om-him/) High-confidence: same statutory provider and existing HIM address/calendar contract. |
| 1149 Karmøy | Rogaland | Karmøy kommune / `authenticated_self_service` | unmapped | `auth_gated` | not_implemented | not_tested | [source](https://www.karmoy.kommune.no/innbygger/teknisk-og-eiendom/renovasjon-og-avfall/tommekalender/) Calendar is exposed through authenticated self-service; no login bypass was attempted. |
| 1151 Utsira | Rogaland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1160 Vindafjord | Rogaland | HIM / `him` | unmapped | `adapter_exists_missing_registry` | implemented_unmapped | not_tested | [source](https://him.as/om-him/) High-confidence: same statutory provider and existing HIM address/calendar contract. |
| 1505 Kristiansund | Møre og Romsdal | ReMidt / `renovasjonsportal` | unmapped | `adapter_exists_missing_registry` | implemented_unmapped | not_tested | [source](https://remidt.no/om-remidt/) Existing provider-family adapter; municipality/property acceptance still requires live validation. |
| 1506 Molde | Møre og Romsdal | Romsdalshalvøya Interkommunale Renovasjonsselskap / `rir` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://www.rir.no/om-rir) |
| 1508 Ålesund | Møre og Romsdal |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1511 Vanylven | Møre og Romsdal |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1514 Sande | Møre og Romsdal |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1515 Herøy | Møre og Romsdal |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1516 Ulstein | Møre og Romsdal |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1517 Hareid | Møre og Romsdal |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1520 Ørsta | Møre og Romsdal |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1525 Stranda | Møre og Romsdal |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1528 Sykkylven | Møre og Romsdal |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1531 Sula | Møre og Romsdal |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1532 Giske | Møre og Romsdal |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1535 Vestnes | Møre og Romsdal |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1539 Rauma | Møre og Romsdal | Romsdalshalvøya Interkommunale Renovasjonsselskap / `rir` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://www.rir.no/om-rir) |
| 1547 Aukra | Møre og Romsdal |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1554 Averøy | Møre og Romsdal |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1557 Gjemnes | Møre og Romsdal | Romsdalshalvøya Interkommunale Renovasjonsselskap / `rir` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://www.rir.no/om-rir) |
| 1560 Tingvoll | Møre og Romsdal | ReMidt / `renovasjonsportal` | unmapped | `adapter_exists_missing_registry` | implemented_unmapped | not_tested | [source](https://remidt.no/om-remidt/) Existing provider-family adapter; municipality/property acceptance still requires live validation. |
| 1563 Sunndal | Møre og Romsdal | ReMidt / `renovasjonsportal` | unmapped | `adapter_exists_missing_registry` | implemented_unmapped | not_tested | [source](https://remidt.no/om-remidt/) Existing provider-family adapter; municipality/property acceptance still requires live validation. |
| 1566 Surnadal | Møre og Romsdal | ReMidt / `renovasjonsportal` | unmapped | `adapter_exists_missing_registry` | implemented_unmapped | not_tested | [source](https://remidt.no/om-remidt/) Existing provider-family adapter; municipality/property acceptance still requires live validation. |
| 1573 Smøla | Møre og Romsdal | ReMidt / `renovasjonsportal` | unmapped | `adapter_exists_missing_registry` | implemented_unmapped | not_tested | [source](https://remidt.no/om-remidt/) Existing provider-family adapter; municipality/property acceptance still requires live validation. |
| 1576 Aure | Møre og Romsdal | ReMidt / `renovasjonsportal` | unmapped | `adapter_exists_missing_registry` | implemented_unmapped | not_tested | [source](https://remidt.no/om-remidt/) Existing provider-family adapter; municipality/property acceptance still requires live validation. |
| 1577 Volda | Møre og Romsdal |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1578 Fjord | Møre og Romsdal |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1579 Hustadvika | Møre og Romsdal | Romsdalshalvøya Interkommunale Renovasjonsselskap / `rir` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://www.rir.no/om-rir) |
| 1580 Haram | Møre og Romsdal |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1804 Bodø | Nordland | Iris Salten / `iris_salten` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://iris-salten.no/om-iris/) |
| 1806 Narvik | Nordland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1811 Bindal | Nordland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1812 Sømna | Nordland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1813 Brønnøy | Nordland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1815 Vega | Nordland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1816 Vevelstad | Nordland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1818 Herøy | Nordland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1820 Alstahaug | Nordland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1822 Leirfjord | Nordland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1824 Vefsn | Nordland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1825 Grane | Nordland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1826 Hattfjelldal | Nordland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1827 Dønna | Nordland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1828 Nesna | Nordland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1832 Hemnes | Nordland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1833 Rana | Nordland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1834 Lurøy | Nordland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1835 Træna | Nordland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1836 Rødøy | Nordland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1837 Meløy | Nordland | Iris Salten / `iris_salten` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://iris-salten.no/om-iris/) |
| 1838 Gildeskål | Nordland | Iris Salten / `iris_salten` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://iris-salten.no/om-iris/) |
| 1839 Beiarn | Nordland | Iris Salten / `iris_salten` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://iris-salten.no/om-iris/) |
| 1840 Saltdal | Nordland | Iris Salten / `iris_salten` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://iris-salten.no/om-iris/) |
| 1841 Fauske | Nordland | Iris Salten / `iris_salten` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://iris-salten.no/om-iris/) |
| 1845 Sørfold | Nordland | Iris Salten / `iris_salten` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://iris-salten.no/om-iris/) |
| 1848 Steigen | Nordland | Iris Salten / `iris_salten` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://iris-salten.no/om-iris/) |
| 1851 Lødingen | Nordland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1853 Evenes | Nordland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1856 Røst | Nordland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1857 Værøy | Nordland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1859 Flakstad | Nordland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1860 Vestvågøy | Nordland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1865 Vågan | Nordland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1866 Hadsel | Nordland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1867 Bø | Nordland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1868 Øksnes | Nordland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1870 Sortland | Nordland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1871 Andøy | Nordland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1874 Moskenes | Nordland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 1875 Hamarøy | Nordland | Iris Salten / `iris_salten` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://iris-salten.no/om-iris/) |
| 3101 Halden | Østfold |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3103 Moss | Østfold | MOVAR / `movar` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://movar.no/renovasjon/) |
| 3105 Sarpsborg | Østfold |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3107 Fredrikstad | Østfold | Fredrikstad kommune / `fredrikstad` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://www.fredrikstad.kommune.no/tjenester/avfall/) |
| 3110 Hvaler | Østfold |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3112 Råde | Østfold | MOVAR / `movar` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://movar.no/renovasjon/) |
| 3114 Våler | Østfold | MOVAR / `movar` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://movar.no/renovasjon/) |
| 3116 Skiptvet | Østfold |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3118 Indre Østfold | Østfold |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3120 Rakkestad | Østfold |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3122 Marker | Østfold |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3124 Aremark | Østfold |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3201 Bærum | Akershus |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3203 Asker | Akershus |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3205 Lillestrøm | Akershus | ROAF / `minrenovasjon` | supported | `credential_blocked` | implemented | credential_not_configured | [source](https://github.com/mampfes/hacs_waste_collection_schedule/tree/1339b9b5b708f4ac825d91c274613b6647a29d68/custom_components/waste_collection_schedule/waste_collection_schedule/source) |
| 3207 Nordre Follo | Akershus |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3209 Ullensaker | Akershus |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3212 Nesodden | Akershus |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3214 Frogn | Akershus |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3216 Vestby | Akershus | MOVAR / `movar` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://movar.no/renovasjon/) |
| 3218 Ås | Akershus |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3220 Enebakk | Akershus | ROAF / `minrenovasjon` | supported | `credential_blocked` | implemented | credential_not_configured | [source](https://github.com/mampfes/hacs_waste_collection_schedule/tree/1339b9b5b708f4ac825d91c274613b6647a29d68/custom_components/waste_collection_schedule/waste_collection_schedule/source) |
| 3222 Lørenskog | Akershus | ROAF / `minrenovasjon` | supported | `credential_blocked` | implemented | credential_not_configured | [source](https://github.com/mampfes/hacs_waste_collection_schedule/tree/1339b9b5b708f4ac825d91c274613b6647a29d68/custom_components/waste_collection_schedule/waste_collection_schedule/source) |
| 3224 Rælingen | Akershus | ROAF / `minrenovasjon` | supported | `credential_blocked` | implemented | credential_not_configured | [source](https://github.com/mampfes/hacs_waste_collection_schedule/tree/1339b9b5b708f4ac825d91c274613b6647a29d68/custom_components/waste_collection_schedule/waste_collection_schedule/source) |
| 3226 Aurskog-Høland | Akershus | ROAF / `minrenovasjon` | supported | `credential_blocked` | implemented | credential_not_configured | [source](https://github.com/mampfes/hacs_waste_collection_schedule/tree/1339b9b5b708f4ac825d91c274613b6647a29d68/custom_components/waste_collection_schedule/waste_collection_schedule/source) |
| 3228 Nes | Akershus |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3230 Gjerdrum | Akershus | ROAF / `minrenovasjon` | supported | `credential_blocked` | implemented | credential_not_configured | [source](https://github.com/mampfes/hacs_waste_collection_schedule/tree/1339b9b5b708f4ac825d91c274613b6647a29d68/custom_components/waste_collection_schedule/waste_collection_schedule/source) |
| 3232 Nittedal | Akershus | ROAF / `minrenovasjon` | supported | `credential_blocked` | implemented | credential_not_configured | [source](https://github.com/mampfes/hacs_waste_collection_schedule/tree/1339b9b5b708f4ac825d91c274613b6647a29d68/custom_components/waste_collection_schedule/waste_collection_schedule/source) |
| 3234 Lunner | Akershus |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3236 Jevnaker | Akershus |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3238 Nannestad | Akershus |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3240 Eidsvoll | Akershus |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3242 Hurdal | Akershus |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3301 Drammen | Buskerud | Renovasjonsselskapet for Drammensregionen / `rfd` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://www.rfd.no/om-rfd) |
| 3303 Kongsberg | Buskerud |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3305 Ringerike | Buskerud |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3310 Hole | Buskerud |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3312 Lier | Buskerud | Renovasjonsselskapet for Drammensregionen / `rfd` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://www.rfd.no/om-rfd) |
| 3314 Øvre Eiker | Buskerud | Renovasjonsselskapet for Drammensregionen / `rfd` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://www.rfd.no/om-rfd) |
| 3316 Modum | Buskerud | Renovasjonsselskapet for Drammensregionen / `rfd` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://www.rfd.no/om-rfd) |
| 3318 Krødsherad | Buskerud | Renovasjonsselskapet for Drammensregionen / `rfd` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://www.rfd.no/om-rfd) |
| 3320 Flå | Buskerud |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3322 Nesbyen | Buskerud |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3324 Gol | Buskerud |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3326 Hemsedal | Buskerud |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3328 Ål | Buskerud |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3330 Hol | Buskerud |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3332 Sigdal | Buskerud | Renovasjonsselskapet for Drammensregionen / `rfd` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://www.rfd.no/om-rfd) |
| 3334 Flesberg | Buskerud |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3336 Rollag | Buskerud |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3338 Nore og Uvdal | Buskerud |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3401 Kongsvinger | Innlandet |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3403 Hamar | Innlandet |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3405 Lillehammer | Innlandet | GLØR / `glor` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://glor.no/om-glor/) |
| 3407 Gjøvik | Innlandet |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3411 Ringsaker | Innlandet |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3412 Løten | Innlandet |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3413 Stange | Innlandet |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3414 Nord-Odal | Innlandet |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3415 Sør-Odal | Innlandet |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3416 Eidskog | Innlandet |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3417 Grue | Innlandet |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3418 Åsnes | Innlandet |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3419 Våler | Innlandet |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3420 Elverum | Innlandet |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3421 Trysil | Innlandet |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3422 Åmot | Innlandet |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3423 Stor-Elvdal | Innlandet |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3424 Rendalen | Innlandet |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3425 Engerdal | Innlandet |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3426 Tolga | Innlandet |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3427 Tynset | Innlandet |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3428 Alvdal | Innlandet |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3429 Folldal | Innlandet |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3430 Os | Innlandet |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3431 Dovre | Innlandet |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3432 Lesja | Innlandet |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3433 Skjåk | Innlandet |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3434 Lom | Innlandet |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3435 Vågå | Innlandet |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3436 Nord-Fron | Innlandet |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3437 Sel | Innlandet |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3438 Sør-Fron | Innlandet |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3439 Ringebu | Innlandet |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3440 Øyer | Innlandet | GLØR / `glor` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://glor.no/om-glor/) |
| 3441 Gausdal | Innlandet | GLØR / `glor` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://glor.no/om-glor/) |
| 3442 Østre Toten | Innlandet |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3443 Vestre Toten | Innlandet |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3446 Gran | Innlandet |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3447 Søndre Land | Innlandet |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3448 Nordre Land | Innlandet |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3449 Sør-Aurdal | Innlandet |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3450 Etnedal | Innlandet |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3451 Nord-Aurdal | Innlandet |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3452 Vestre Slidre | Innlandet |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3453 Øystre Slidre | Innlandet |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3454 Vang | Innlandet |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3901 Horten | Vestfold |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3903 Holmestrand | Vestfold |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3905 Tønsberg | Vestfold |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3907 Sandefjord | Vestfold |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3909 Larvik | Vestfold |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 3911 Færder | Vestfold |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4001 Porsgrunn | Telemark |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4003 Skien | Telemark |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4005 Notodden | Telemark |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4010 Siljan | Telemark |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4012 Bamble | Telemark |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4014 Kragerø | Telemark |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4016 Drangedal | Telemark |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4018 Nome | Telemark |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4020 Midt-Telemark | Telemark |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4022 Seljord | Telemark |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4024 Hjartdal | Telemark |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4026 Tinn | Telemark |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4028 Kviteseid | Telemark |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4030 Nissedal | Telemark |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4032 Fyresdal | Telemark |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4034 Tokke | Telemark |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4036 Vinje | Telemark |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4201 Risør | Agder |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4202 Grimstad | Agder |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4203 Arendal | Agder |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4204 Kristiansand | Agder | Avfall Sør / `avfallsor` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://avfallsor.no/om-avfall-sor/) |
| 4205 Lindesnes | Agder |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4206 Farsund | Agder |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4207 Flekkefjord | Agder |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4211 Gjerstad | Agder |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4212 Vegårshei | Agder |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4213 Tvedestrand | Agder |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4214 Froland | Agder |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4215 Lillesand | Agder |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4216 Birkenes | Agder |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4217 Åmli | Agder |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4218 Iveland | Agder |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4219 Evje og Hornnes | Agder |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4220 Bygland | Agder |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4221 Valle | Agder |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4222 Bykle | Agder |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4223 Vennesla | Agder | Avfall Sør / `avfallsor` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://avfallsor.no/om-avfall-sor/) |
| 4224 Åseral | Agder |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4225 Lyngdal | Agder |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4226 Hægebostad | Agder |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4227 Kvinesdal | Agder |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4228 Sirdal | Agder |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4601 Bergen | Vestland | BIR / `bir` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://bir.no/om-bir/selskaper-og-eiere/) BIR statutory household-waste municipalities; upstream adapter exists. Øygarden intentionally excluded. |
| 4602 Kinn | Vestland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4611 Etne | Vestland | HIM / `him` | unmapped | `adapter_exists_missing_registry` | implemented_unmapped | not_tested | [source](https://him.as/om-him/) High-confidence: same statutory provider and existing HIM address/calendar contract. |
| 4612 Sveio | Vestland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4613 Bømlo | Vestland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4614 Stord | Vestland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4615 Fitjar | Vestland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4616 Tysnes | Vestland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4617 Kvinnherad | Vestland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4618 Ullensvang | Vestland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4619 Eidfjord | Vestland | BIR / `bir` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://bir.no/om-bir/selskaper-og-eiere/) BIR statutory household-waste municipalities; upstream adapter exists. Øygarden intentionally excluded. |
| 4620 Ulvik | Vestland | BIR / `bir` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://bir.no/om-bir/selskaper-og-eiere/) BIR statutory household-waste municipalities; upstream adapter exists. Øygarden intentionally excluded. |
| 4621 Voss | Vestland | BIR / `bir` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://bir.no/om-bir/selskaper-og-eiere/) BIR statutory household-waste municipalities; upstream adapter exists. Øygarden intentionally excluded. |
| 4622 Kvam | Vestland | BIR / `bir` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://bir.no/om-bir/selskaper-og-eiere/) BIR statutory household-waste municipalities; upstream adapter exists. Øygarden intentionally excluded. |
| 4623 Samnanger | Vestland | BIR / `bir` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://bir.no/om-bir/selskaper-og-eiere/) BIR statutory household-waste municipalities; upstream adapter exists. Øygarden intentionally excluded. |
| 4624 Bjørnafjorden | Vestland | BIR / `bir` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://bir.no/om-bir/selskaper-og-eiere/) BIR statutory household-waste municipalities; upstream adapter exists. Øygarden intentionally excluded. |
| 4625 Austevoll | Vestland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4626 Øygarden | Vestland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4627 Askøy | Vestland | BIR / `bir` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://bir.no/om-bir/selskaper-og-eiere/) BIR statutory household-waste municipalities; upstream adapter exists. Øygarden intentionally excluded. |
| 4628 Vaksdal | Vestland | BIR / `bir` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://bir.no/om-bir/selskaper-og-eiere/) BIR statutory household-waste municipalities; upstream adapter exists. Øygarden intentionally excluded. |
| 4629 Modalen | Vestland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4630 Osterøy | Vestland | BIR / `bir` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://bir.no/om-bir/selskaper-og-eiere/) BIR statutory household-waste municipalities; upstream adapter exists. Øygarden intentionally excluded. |
| 4631 Alver | Vestland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4632 Austrheim | Vestland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4633 Fedje | Vestland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4634 Masfjorden | Vestland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4635 Gulen | Vestland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4636 Solund | Vestland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4637 Hyllestad | Vestland | SUM / `sum` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://www.sumavfall.no/om-oss) |
| 4638 Høyanger | Vestland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4639 Vik | Vestland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4640 Sogndal | Vestland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4641 Aurland | Vestland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4642 Lærdal | Vestland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4643 Årdal | Vestland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4644 Luster | Vestland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4645 Askvoll | Vestland | SUM / `sum` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://www.sumavfall.no/om-oss) |
| 4646 Fjaler | Vestland | SUM / `sum` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://www.sumavfall.no/om-oss) |
| 4647 Sunnfjord | Vestland | SUM / `sum` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://www.sumavfall.no/om-oss) |
| 4648 Bremanger | Vestland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4649 Stad | Vestland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4650 Gloppen | Vestland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 4651 Stryn | Vestland |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5001 Trondheim | Trøndelag - Trööndelage | Trondheim Renholdsverk / `trondheim` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://trv.no/om-oss/) |
| 5006 Steinkjer | Trøndelag - Trööndelage | Steinkjer kommune / `minrenovasjon` | supported | `credential_blocked` | implemented | credential_not_configured | [source](https://github.com/mampfes/hacs_waste_collection_schedule/tree/1339b9b5b708f4ac825d91c274613b6647a29d68/custom_components/waste_collection_schedule/waste_collection_schedule/source) |
| 5007 Namsos | Trøndelag - Trööndelage |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5014 Frøya | Trøndelag - Trööndelage | ReMidt / `renovasjonsportal` | unmapped | `adapter_exists_missing_registry` | implemented_unmapped | not_tested | [source](https://remidt.no/om-remidt/) Existing provider-family adapter; municipality/property acceptance still requires live validation. |
| 5020 Osen | Trøndelag - Trööndelage | Fosen Renovasjon / `renovasjonsportal` | unmapped | `adapter_exists_missing_registry` | implemented_unmapped | not_tested | [source](https://fosenrenovasjon.no/om-oss/) High-confidence registry expansion candidate; validate an Osen address before routing. |
| 5021 Oppdal | Trøndelag - Trööndelage | ReMidt / `renovasjonsportal` | unmapped | `adapter_exists_missing_registry` | implemented_unmapped | not_tested | [source](https://remidt.no/om-remidt/) Existing provider-family adapter; municipality/property acceptance still requires live validation. |
| 5022 Rennebu | Trøndelag - Trööndelage | ReMidt / `renovasjonsportal` | unmapped | `adapter_exists_missing_registry` | implemented_unmapped | not_tested | [source](https://remidt.no/om-remidt/) Existing provider-family adapter; municipality/property acceptance still requires live validation. |
| 5025 Røros | Trøndelag - Trööndelage |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5026 Holtålen | Trøndelag - Trööndelage | ReMidt / `renovasjonsportal` | unmapped | `adapter_exists_missing_registry` | implemented_unmapped | not_tested | [source](https://remidt.no/om-remidt/) Existing provider-family adapter; municipality/property acceptance still requires live validation. |
| 5027 Midtre Gauldal | Trøndelag - Trööndelage | ReMidt / `renovasjonsportal` | unmapped | `adapter_exists_missing_registry` | implemented_unmapped | not_tested | [source](https://remidt.no/om-remidt/) Existing provider-family adapter; municipality/property acceptance still requires live validation. |
| 5028 Melhus | Trøndelag - Trööndelage | ReMidt / `renovasjonsportal` | unmapped | `adapter_exists_missing_registry` | implemented_unmapped | not_tested | [source](https://remidt.no/om-remidt/) Existing provider-family adapter; municipality/property acceptance still requires live validation. |
| 5029 Skaun | Trøndelag - Trööndelage | ReMidt / `renovasjonsportal` | unmapped | `adapter_exists_missing_registry` | implemented_unmapped | not_tested | [source](https://remidt.no/om-remidt/) Existing provider-family adapter; municipality/property acceptance still requires live validation. |
| 5031 Malvik | Trøndelag - Trööndelage | Innherred Renovasjon / `innherred` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://innherredrenovasjon.no/om-oss/) |
| 5032 Selbu | Trøndelag - Trööndelage | Innherred Renovasjon / `innherred` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://innherredrenovasjon.no/om-oss/) |
| 5033 Tydal | Trøndelag - Trööndelage | Innherred Renovasjon / `innherred` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://innherredrenovasjon.no/om-oss/) |
| 5034 Meråker | Trøndelag - Trööndelage | Innherred Renovasjon / `innherred` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://innherredrenovasjon.no/om-oss/) |
| 5035 Stjørdal | Trøndelag - Trööndelage | Innherred Renovasjon / `innherred` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://innherredrenovasjon.no/om-oss/) |
| 5036 Frosta | Trøndelag - Trööndelage | Innherred Renovasjon / `innherred` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://innherredrenovasjon.no/om-oss/) |
| 5037 Levanger | Trøndelag - Trööndelage | Innherred Renovasjon / `innherred` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://innherredrenovasjon.no/om-oss/) |
| 5038 Verdal | Trøndelag - Trööndelage | Innherred Renovasjon / `innherred` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://innherredrenovasjon.no/om-oss/) |
| 5041 Snåase - Snåsa | Trøndelag - Trööndelage |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5042 Lierne | Trøndelag - Trööndelage |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5043 Raarvihke - Røyrvik | Trøndelag - Trööndelage |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5044 Namsskogan | Trøndelag - Trööndelage |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5045 Grong | Trøndelag - Trööndelage |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5046 Høylandet | Trøndelag - Trööndelage |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5047 Overhalla | Trøndelag - Trööndelage |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5049 Flatanger | Trøndelag - Trööndelage |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5052 Leka | Trøndelag - Trööndelage |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5053 Inderøy | Trøndelag - Trööndelage | Innherred Renovasjon / `innherred` | unmapped | `known_provider_no_adapter` | not_implemented | not_tested | [source](https://innherredrenovasjon.no/om-oss/) |
| 5054 Indre Fosen | Trøndelag - Trööndelage | Fosen Renovasjon / `renovasjonsportal` | supported | `supported` | implemented | not_tested | [source](https://github.com/mampfes/hacs_waste_collection_schedule/tree/1339b9b5b708f4ac825d91c274613b6647a29d68/custom_components/waste_collection_schedule/waste_collection_schedule/source) |
| 5055 Heim | Trøndelag - Trööndelage | ReMidt / `renovasjonsportal` | supported | `supported` | implemented | not_tested | [source](https://github.com/mampfes/hacs_waste_collection_schedule/tree/1339b9b5b708f4ac825d91c274613b6647a29d68/custom_components/waste_collection_schedule/waste_collection_schedule/source) |
| 5056 Hitra | Trøndelag - Trööndelage | ReMidt / `renovasjonsportal` | unmapped | `adapter_exists_missing_registry` | implemented_unmapped | not_tested | [source](https://remidt.no/om-remidt/) Existing provider-family adapter; municipality/property acceptance still requires live validation. |
| 5057 Ørland | Trøndelag - Trööndelage | Fosen Renovasjon / `renovasjonsportal` | supported | `supported` | implemented | not_tested | [source](https://github.com/mampfes/hacs_waste_collection_schedule/tree/1339b9b5b708f4ac825d91c274613b6647a29d68/custom_components/waste_collection_schedule/waste_collection_schedule/source) |
| 5058 Åfjord | Trøndelag - Trööndelage | Fosen Renovasjon / `renovasjonsportal` | supported | `supported` | implemented | not_tested | [source](https://github.com/mampfes/hacs_waste_collection_schedule/tree/1339b9b5b708f4ac825d91c274613b6647a29d68/custom_components/waste_collection_schedule/waste_collection_schedule/source) |
| 5059 Orkland | Trøndelag - Trööndelage | ReMidt / `renovasjonsportal` | supported | `supported` | implemented | not_tested | [source](https://github.com/mampfes/hacs_waste_collection_schedule/tree/1339b9b5b708f4ac825d91c274613b6647a29d68/custom_components/waste_collection_schedule/waste_collection_schedule/source) |
| 5060 Nærøysund | Trøndelag - Trööndelage |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5061 Rindal | Trøndelag - Trööndelage | ReMidt / `renovasjonsportal` | unmapped | `adapter_exists_missing_registry` | implemented_unmapped | not_tested | [source](https://remidt.no/om-remidt/) Existing provider-family adapter; municipality/property acceptance still requires live validation. |
| 5501 Tromsø | Troms - Romsa - Tromssa |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5503 Harstad - Hárstták | Troms - Romsa - Tromssa |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5510 Kvæfjord | Troms - Romsa - Tromssa |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5512 Tjeldsund - Dielddanuorri | Troms - Romsa - Tromssa |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5514 Ibestad | Troms - Romsa - Tromssa |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5516 Gratangen | Troms - Romsa - Tromssa |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5518 Loabák - Lavangen | Troms - Romsa - Tromssa |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5520 Bardu | Troms - Romsa - Tromssa |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5522 Salangen | Troms - Romsa - Tromssa |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5524 Målselv | Troms - Romsa - Tromssa |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5526 Sørreisa | Troms - Romsa - Tromssa |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5528 Dyrøy | Troms - Romsa - Tromssa |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5530 Senja | Troms - Romsa - Tromssa |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5532 Balsfjord | Troms - Romsa - Tromssa |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5534 Karlsøy | Troms - Romsa - Tromssa |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5536 Lyngen | Troms - Romsa - Tromssa |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5538 Storfjord - Omasvuotna - Omasvuono | Troms - Romsa - Tromssa |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5540 Gáivuotna - Kåfjord - Kaivuono | Troms - Romsa - Tromssa |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5542 Skjervøy | Troms - Romsa - Tromssa |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5544 Nordreisa - Ráisa - Raisi | Troms - Romsa - Tromssa |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5546 Kvænangen | Troms - Romsa - Tromssa |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5601 Alta | Finnmark - Finnmárku - Finmarkku |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5603 Hammerfest - Hámmerfeasta | Finnmark - Finnmárku - Finmarkku |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5605 Sør-Varanger | Finnmark - Finnmárku - Finmarkku |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5607 Vadsø | Finnmark - Finnmárku - Finmarkku |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5610 Kárášjohka - Karasjok | Finnmark - Finnmárku - Finmarkku |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5612 Guovdageaidnu - Kautokeino | Finnmark - Finnmárku - Finmarkku |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5614 Loppa | Finnmark - Finnmárku - Finmarkku |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5616 Hasvik | Finnmark - Finnmárku - Finmarkku |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5618 Måsøy | Finnmark - Finnmárku - Finmarkku |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5620 Nordkapp | Finnmark - Finnmárku - Finmarkku |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5622 Porsanger - Porsáŋgu - Porsanki | Finnmark - Finnmárku - Finmarkku |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5624 Lebesby | Finnmark - Finnmárku - Finmarkku |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5626 Gamvik | Finnmark - Finnmárku - Finmarkku |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5628 Tana - Deatnu | Finnmark - Finnmárku - Finmarkku |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5630 Berlevåg | Finnmark - Finnmárku - Finmarkku |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5632 Båtsfjord | Finnmark - Finnmárku - Finmarkku |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5634 Vardø | Finnmark - Finnmárku - Finmarkku |  | unmapped | `unknown_provider` | unknown | not_tested |  |
| 5636 Nesseby - Unjárga | Finnmark - Finnmárku - Finmarkku |  | unmapped | `unknown_provider` | unknown | not_tested |  |
<!-- AUDIT_MATRIX_END -->
