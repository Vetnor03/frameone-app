# Norwegian waste provider provenance

Parts of the provider-contract research and adapter structure in
`app/lib/integrations/waste/providers.ts` were materially adapted from
[`mampfes/hacs_waste_collection_schedule`](https://github.com/mampfes/hacs_waste_collection_schedule)
at commit `1339b9b5b708f4ac825d91c274613b6647a29d68`.

Upstream is licensed under the MIT License, Copyright (c) 2020 Steffen Zimmermann.
No upstream MinRenovasjon application key is included in RE:MIND.

| RE:MIND adapter | Upstream source file(s) consulted |
| --- | --- |
| HIM | `custom_components/waste_collection_schedule/waste_collection_schedule/source/him.py` |
| Oslo | `custom_components/waste_collection_schedule/waste_collection_schedule/source/oslo.py` |
| MinRenovasjon / ROAF | `custom_components/waste_collection_schedule/waste_collection_schedule/source/min_renovasjon.py` |
| Renovasjonsportal / Fosen Renovasjon | `custom_components/waste_collection_schedule/waste_collection_schedule/source/fosen_renovasjon.py` |
| Renovasjonsportal / ReMidt | `custom_components/waste_collection_schedule/waste_collection_schedule/source/remidt.py` |

Only the explicitly documented provider contracts were adapted. RE:MIND does not use
generic municipality HTML or JavaScript endpoint discovery.
