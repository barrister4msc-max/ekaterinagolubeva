# FNS DEBTAM audit — 2026-08-20

Dataset: `7707329152-debtam`

Official owner: ФНС России.

Official landing page checked: `https://www.nalog.gov.ru/opendata/7707329152-debtam/`.

## Current official release observed

- data URL: `https://file.nalog.ru/opendata/7707329152-debtam/data-20260725-structure-20181201.zip`
- schema URL: `https://file.nalog.ru/opendata/7707329152-debtam/structure-20181201.xsd`
- last change date / published release: `2026-07-25`
- page says latest change content: `Данные на 01.07.2026`
- curated `data_as_of`: `2026-07-01`
- page lists data format: XML
- structure version: `20181201`

## Semantics confirmed by official FNS page

The dataset contains debt amounts for taxes, fees, insurance contributions, penalties and fines, including breakdown by individual tax/fee/contribution and penalties/fines.

The official description states that the published debt data are point-in-time data and that subsequent repayment as of the publication date is not reflected. Therefore this dataset MUST NOT be interpreted as a live/current debt balance after `data_as_of`.

## Safety classification

DEBTAM remains factual official data only:

- `source_family = factual_official_data`
- `fact_kind = tax_debt`
- `legal_authority = false`
- `substantive_use_allowed = false`
- `use_as_legal_source = false`
- must not enter `RawSource` / `TrustedSource`
- must not support legal conclusions by itself

## Executable release verification

Pinned official files were downloaded and inspected in GitHub Actions without committing source rows.

Verified file identities:

- XSD bytes: `13079`
- XSD SHA-256: `aebacd60dbf9df19a6ef672418cd7fcad10cfdeb95d9b54bedc80e08c2ab4e8b`
- ZIP bytes: `74939431`
- ZIP SHA-256: `0bf119d728c4c6876e6aebe2331bfbfe8a9c0db87682b89d18e3b3d70a8845f5`
- ZIP XML members: `982`
- XML encoding: UTF-8

Exact XSD / XML structure verified:

- `Файл/Документ/СведНП@ИННЮЛ` — legal-entity INN
- `Файл/Документ/СведНП@НаимОрг` — organization name
- `Файл/Документ/СведНедоим@НаимНалог` — tax/fee/contribution label
- `Файл/Документ/СведНедоим@СумНедНалог` — tax/fee/contribution debt amount
- `Файл/Документ/СведНедоим@СумПени` — penalties amount
- `Файл/Документ/СведНедоим@СумШтраф` — fines amount
- `Файл/Документ/СведНедоим@ОбщСумНедоим` — total debt for that debt record
- `Файл/Документ@ДатаДок`
- `Файл/Документ@ДатаСост`

The XSD declares `ИННЮЛ` via `ИННЮЛТип` and date attributes via `ДатаТип`.

## Bounded real-data shape verification

A bounded probe across the first 5 XML members inspected 4,504 documents / taxpayers and 13,152 debt rows without persisting source values.

Observed structural facts:

- 4,504 / 4,504 taxpayer rows had a 10-digit INN.
- 4,504 / 4,504 had an organization name.
- 13,152 / 13,152 debt rows had `НаимНалог`.
- 3,732 of 4,504 documents had more than one `СведНедоим` row, so one legal entity can have multiple debt records and storage MUST preserve row-level category records rather than flatten to one amount per INN.

Observed monetary representation in the bounded sample:

- all four money attributes were present on all 13,152 sampled debt rows;
- decimal separator was `.`;
- maximum observed scale was 2 decimal places;
- no negative values were observed;
- no empty monetary attributes were observed;
- zero values are valid for component fields (`СумНедНалог`, `СумПени`, `СумШтраф`);
- `ОбщСумНедоим` had no zero values in the bounded sample.

These observations are sample evidence, not a guarantee that later releases cannot contain additional edge cases. Parser validation must remain fail-closed on schema/release drift.

## Parser/storage contract now permitted

The field-level gate for this pinned release is satisfied sufficiently to design a deterministic parser and storage/RPC layer.

Required implementation invariants for the next stage:

1. Accept only the pinned dataset id / schema contract unless an explicit reviewed catalog update occurs.
2. Require exact 10-digit legal-entity INN.
3. Preserve one-to-many debt rows per organization.
4. Parse money with exact decimal semantics; never use binary floating point for stored monetary values.
5. Preserve `НаимНалог` and the four monetary components separately.
6. Preserve `data_as_of=2026-07-01` and publication/release provenance.
7. A later repayment cannot be inferred from this release; rows describe the published point-in-time state only.
8. `factual_only=true`, `legal_authority=false`, `substantive_use_allowed=false`, `use_as_legal_source=false` remain mandatory.
9. Reject unknown schema/release drift instead of guessing fields.

## Freshness finding

The previous catalog pin `data-20260625-structure-20181201.zip` / `data_as_of=2026-06-01` was stale relative to the official page observed on 2026-08-20. This stage refreshes the curated release metadata to the official July release and proves the pinned XSD/archive contract; it still performs no Production/Preview import or deployment.
