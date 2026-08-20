# FNS DEBTAM audit — 2026-08-20

Dataset: `7707329152-debtam`

Official owner: ФНС России.

Official landing page checked: `https://www.nalog.gov.ru/opendata/7707329152-debtam/`.

## Current official release observed

- data URL: `https://file.nalog.ru/opendata/7707329152-debtam/data-20260725-structure-20181201.zip`
- schema URL: `https://file.nalog.ru/opendata/7707329152-debtam/structure-20181201.xsd`
- last change date / published release: `2026-07-25`
- page says latest change content: `Данные на 01.07.2026`
- therefore curated `data_as_of`: `2026-07-01`
- page lists data format: XML
- structure version remains `20181201`

## Semantics confirmed by official FNS page

The dataset contains debt amounts for taxes, fees, insurance contributions, penalties and fines, including breakdown by individual tax/fee/contribution and penalties/fines.

The official description states that the published debt data are point-in-time data and that subsequent repayment as of the publication date is not reflected. Therefore this dataset MUST NOT be interpreted as a live/current debt balance after `data_as_of`.

The official description also says the information is formed for a recurring quarterly observation point. The catalog must preserve the explicit `data_as_of` supplied by the official release metadata rather than infer current debt from publication time.

## Safety classification

DEBTAM remains factual official data only:

- `source_family = factual_official_data`
- `fact_kind = tax_debt`
- `legal_authority = false`
- `substantive_use_allowed = false`
- must not enter `RawSource` / `TrustedSource`
- must not support legal conclusions by itself

## Field-level parser gate

This audit intentionally DOES NOT introduce parser/storage/RPC logic.

Before DEBTAM ingestion is implemented, the exact XSD/sample XML fields must be executable-verified from the official release. Required minimum proof:

1. exact legal-entity identifier field(s), including INN cardinality/format;
2. organization-name field;
3. exact debt amount field(s) and decimal semantics;
4. exact tax/fee/contribution classifier fields;
5. exact penalty/fine representation;
6. whether one organization can have multiple debt rows and how they are grouped;
7. whether zero/negative/empty values can occur and their meaning;
8. encoding and archive layout;
9. release ZIP SHA-256 and XSD SHA-256.

Until those are proven, DEBTAM ingestion remains blocked fail-closed. No fuzzy field guessing and no parser copied from SNR.

## Freshness finding

The previous catalog pin `data-20260625-structure-20181201.zip` / `data_as_of=2026-06-01` is stale relative to the official page observed on 2026-08-20. This stage refreshes only the curated release metadata to the official July release; it does not ingest or deploy data.
