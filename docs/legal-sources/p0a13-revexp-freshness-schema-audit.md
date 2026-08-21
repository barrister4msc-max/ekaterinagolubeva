# P0-A13 — FNS REVEXP freshness/schema audit

Status: audit-only. No Production/Preview changes, no database import, no legal-source promotion.

Dataset: `7707329152-revexp` — «Сведения о суммах доходов и расходов по данным бухгалтерской (финансовой) отчетности организации за год, предшествующий году размещения таких сведений на сайте ФНС России».

## Official landing metadata verified on 2026-08-21

Official landing page: `https://www.nalog.gov.ru/opendata/7707329152-revexp/`.

The FNS landing page currently reports:

- current data release: `https://file.nalog.ru/opendata/7707329152-revexp/data-20260725-structure-20180110.zip`;
- XSD: `https://file.nalog.ru/opendata/7707329152-revexp/structure-20180110.xsd`;
- format: XML;
- last change: `2026-07-25`;
- change description: `Данные за 2025 год`;
- landing-page actuality date: `2026-08-25`.

The dataset description says that it contains information about legal entities that submitted accounting (financial) statements for the year preceding publication. Therefore the factual reporting date used by KATI LAWYER is `2025-12-31`, not the landing-page actuality date and not the ZIP publication date.

## Controlled real-data verification

A temporary GitHub Actions verifier downloaded only the current official ZIP and XSD from `file.nalog.ru`; it did not import any rows into Supabase.

Verified immutable provenance:

- ZIP SHA256: `bada16ef2497084edd342c0e2f00442293ac708f28a51fb8954fa21a0941f8d8`;
- ZIP bytes: `104365902`;
- XSD SHA256: `71156f70e08072672d7cc28bb7dd8e9f03891edb72411133b23d4c1dabcd8f57`;
- XSD bytes: `11651`;
- XML files in ZIP: `2114`.

Bounded inspection: first 5 XML files, maximum 25 structured organization rows.

Result:

- 25 rows parsed;
- 25 unique 10-digit legal-entity INNs;
- every sampled `ДатаСост` was `31.12.2025`;
- XSD contains the required structured tokens `СведНП`, `ИННЮЛ`, `НаимОрг`, `СведДохРасх`, `СумДоход`, `СумРасход`, `ДатаСост`, `ИдДок`;
- sampled monetary values are decimal strings with two fractional digits.

Representative structured row shape:

```text
Документ
  ИдДок
  ДатаДок = 25.07.2026
  ДатаСост = 31.12.2025
  СведНП
    НаимОрг
    ИННЮЛ
  СведДохРасх
    СумДоход
    СумРасход
```

## Semantic decision

REVEXP does **not** mean tax revenue, taxable income, turnover inferred by AI, current cash flow, or current financial position. It directly records the published annual `СумДоход` and `СумРасход` values from the organization's accounting (financial) statements for the reporting year.

For the next implementation stage the safe factual proposition is therefore an annual financial-statement observation, for example:

```text
fact_kind = financial_statement
subject = legal_entity / exact 10-digit INN
reporting_date = 2025-12-31
income_amount = exact decimal text from СумДоход
expense_amount = exact decimal text from СумРасход
```

Do not label `СумДоход` as `turnover` in the canonical contract. If a UI later wants a human-facing label, it must preserve the source meaning «доходы по данным бухгалтерской (финансовой) отчетности».

## Identity and relation decision for the next stage

The structured row directly records the proposition, so `DIRECTLY_RECORDS` remains appropriate.

A deterministic identity should use exact structured fields and must not use company-name matching, OCR, model output, embeddings or fuzzy matching. Minimum identity inputs:

- exact 10-digit INN;
- `ДатаСост` / normalized reporting date;
- `ИдДок`.

`ДатаДок` is publication/document metadata and should be preserved for provenance, but it is not a substitute for the reporting date.

## Safety contract

REVEXP remains:

```text
source_family = factual_official_data
factual_only = true
legal_authority = false
substantive_use_allowed = false
use_as_legal_source = false
```

It must not enter `RawSource`, `TrustedSource`, legal conclusions, Source Sufficiency, Challenge or generator prompt through the legal-source path.

## Catalog correction

The earlier catalog pin `data-20260625-structure-20180110.zip` was stale. P0-A13 refreshes only the REVEXP pin/title/publication date to the verified current release while preserving `data_as_of = 2025-12-31`.

## Next stage

P0-A14 may add the deterministic REVEXP parser/storage/RPC contract, still with no real-data import and no Production/Preview changes. Monetary fields should preserve exact decimal precision (prefer PostgreSQL `numeric` plus text-returning RPC boundary if consumed by JavaScript), following the precision protection already established for DEBTAM.
