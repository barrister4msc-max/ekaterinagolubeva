# Russian Law MCP / RusLawOD audit — 2026-08-20

## Decision

Do not import the packaged Russian Law MCP database into commercial KATI LAWYER as a trusted or substantive corpus at this stage.

## Verified upstream facts

- Russian Law MCP code is Apache-2.0.
- Its documented primary corpus pipeline is RusLawOD -> DuckDB -> article parser -> seed JSON -> SQLite/FTS5, with a direct pravo.gov.ru HTML ingestion path as fallback.
- The packaged SQLite schema stores `laws.source_url` but does not store a deterministic row-level origin flag distinguishing `RusLawOD` text from a direct `pravo.gov.ru` fetch.
- `ingest-ruslawod.py` reads `textIPS` from RusLawOD and then constructs a `pravo.gov.ru/proxy/ips/?...&nd=...` source URL. Therefore `source_url` alone does not prove that the text was fetched directly from the official portal.
- Current RusLawOD releases state that legal-act texts can be redistributed, but project materials other than those texts are CC BY-NC 4.0. The Hugging Face dataset is labelled CC BY-NC 4.0.
- RusLawOD is primarily a corpus of initial versions, not a consolidated current-version database.

## KATI LAWYER treatment

Russian Law MCP remains useful as:

- an Apache-2.0 parser/schema/search implementation reference;
- a possible future controlled ingestion tool after provenance is made explicit;
- retrieval architecture inspiration only.

RusLawOD remains useful as:

- a discovery/historical corpus candidate;
- a source of document identity hints;
- a corpus that requires separate licensing/provenance review before commercial bulk ingestion.

Neither source may self-certify official origin, current applicability, or substantive use.

## FNS Open Data path

Proceed with FNS Open Data first because FNS publishes documented HTTPS dataset and schema URLs directly on official domains. Import them as `factual_official_data`, never as legal authority.

The first controlled real-data parser dry-run uses the FNS SNR dataset `7707329152-snr`, pinned to the verified `2026-06-25` release and `structure-20230425.xsd`. The parser is read-only and uses Python stdlib `zipfile` + `xml.etree.ElementTree.iterparse`; it does not contain a database client or a write path.
