# P0-A Source Family Orchestration

This change extends the existing KATI LAWYER research/source layer. It does not create a second Analyzer, source registry, legal reasoning engine, or hidden scraper.

## Source-family roles

- Law7 / Russian Law MCP / RusLawOD: broad or exact normative retrieval candidates; no automatic substantive authority.
- Pravo: canonical official verification when transport/content evidence is available.
- FNS / Minfin: official explanation coverage per research issue.
- VSRF / KAD: judicial candidates; official verification remains separate.
- Sudact / Klerk: secondary discovery only.
- Duma API: legislative-process/freshness signal; never a substitute for the currently applicable published text.
- FNS Open Data / EGRUL / BFO: factual official data/evidence; not legal authority.

## Interaction model

All families meet through the existing ResearchQuestion -> RawSource -> ranking/dedupe -> Canonical Source Metadata Bridge -> TrustedSource -> Conclusions -> Evidence Matrix -> Source Sufficiency -> Challenge -> GAP pipeline.

No provider self-certifies authority. Search inference never becomes a case fact.
