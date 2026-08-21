# P0-A18 — FNS SSHR2019 freshness and schema audit

Dataset: `7707329152-sshr2019` — «Сведения о среднесписочной численности работников организации».

## Official landing-page state checked 2026-08-21

Official FNS landing page: `https://www.nalog.gov.ru/opendata/7707329152-sshr2019/`.

The current official page states:

- owner: ФНС России;
- current data release: `https://file.nalog.ru/opendata/7707329152-sshr2019/data-20260725-structure-20200408.zip`;
- schema: `https://file.nalog.ru/opendata/7707329152-sshr2019/structure-20200408.xsd`;
- format: XML;
- date of last change: `25.07.2026`;
- content of last change: `Данные за 2025 год`;
- page dataset actuality date: `25.08.2026`;
- page updated: `10.08.2026`.

The page description says that the dataset contains information on the average headcount of an organisation submitted in accordance with paragraph 3 of Article 80 of the Tax Code, and that publication is formed under FNS Order No. ММВ-7-14/729@.

The previous catalog pin (`data-20260625-...`) was therefore stale and is refreshed in this stage to the current `20260725` release.

## Exact release provenance

Controlled download of the pinned official FNS files produced:

- ZIP bytes: `98,434,553`;
- ZIP SHA-256: `265eca8b05a234ff629f57779ebbc647d07e42c7e43612b40e9ae84340de1464`;
- XSD bytes: `11,173`;
- XSD SHA-256: `3c63a9447e0c0dbacaf9fe11f1888c5873137f9252f226c148303dd6dfa9d137`;
- ZIP members: `2,271`;
- XML members: `2,271`.

No import into Preview or Production was performed.

## XSD / XML contract observed

The official XSD declares these core elements:

- `Файл`;
- `Документ`;
- `СведНП`;
- `СведССЧР`;
- `ИдОтпр`;
- `ФИООтв`.

Relevant structured attributes include:

- `СведНП@ИННЮЛ`;
- `СведНП@НаимОрг`;
- `СведССЧР@КолРаб`;
- `Документ@ИдДок`;
- `Документ@ДатаДок`;
- `Документ@ДатаСост`;
- root `Файл@ВерсФорм`, `Файл@ТипИнф`, `Файл@КолДок`.

A bounded probe of the first five XML members found 4,500 `Документ`, 4,500 `СведНП` and 4,500 `СведССЧР` rows. The observed root format was `ВерсФорм="4.01"`, `ТипИнф="ОТКРДАННЫЕ3"`. The sampled documents had `ДатаДок="25.07.2026"` and `ДатаСост="31.12.2025"`. Observed `ИННЮЛ` values were exact 10-digit legal-entity INNs. `КолРаб` was represented as an integer-like string; observed values included `0`, `1`, `2`, `3`, `5`, `6`, `7`, `9`.

`КолРаб=0` must therefore remain a valid factual value and must not be converted into missing/unknown.

## Semantics and canonical boundary

For KATI LAWYER this dataset is factual official data, not legal authority.

The future structured proposition should preserve the source meaning:

```text
fact_kind = headcount
subject = legal_entity / exact 10-digit INN
reporting_date = Документ@ДатаСост
average_headcount = СведССЧР@КолРаб
document_id = Документ@ИдДок
document_date = Документ@ДатаДок
```

The field should be named `average_headcount` (or an equally literal equivalent), not `employees`, `staff`, `current_employees`, `payroll`, `fte`, or another broader concept. The dataset records the published average headcount indicator; it does not establish a live employee count on the date of retrieval.

`data_as_of` remains `2025-12-31`: the official page says the release contains data for 2025, and the sampled structured records explicitly carry `ДатаСост=31.12.2025`. The landing-page `Дата актуальности=25.08.2026` is publication/catalog freshness metadata and is not substituted for the reporting date of the factual proposition.

## Safety contract

The existing source-family boundary is unchanged:

```text
source_type = fns_open_data
source_family = factual_official_data
factual_only = true
legal_authority = false
substantive_use_allowed = false
use_as_legal_source = false
```

SSHR2019 must not enter `RawSource`, `TrustedSource`, legal conclusions, Source Sufficiency, Challenge, or generator legal authority paths. No fuzzy name matching, OCR-derived INN matching, embeddings, or LLM matching should be used for subject identity; only explicit structured legal-entity INN is suitable for the future adapter.

## Next implementation boundary

The next stage may add deterministic parser/private storage/service-role RPC only, with no real-data import. It should preserve `КолРаб` as a non-negative integer including zero, preserve the exact reporting date and document identity, validate format/version drift, and fail closed on malformed structured rows.
