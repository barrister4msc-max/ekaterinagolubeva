# Official Legal Sources Layer — audit + safety baseline

Date: 2026-08-17
Baseline examined: `main` (`analyze-document-legal-position` pipeline)

## Existing pipeline

`analyze-document-legal-position/index.ts` executes:

1. Fact extraction / ResearchQuery
2. Repository search
3. Ranking
4. Dedupe / caps
5. Gemini Pro
6. Registry merge
7. Source enrichment / conclusion validation / sufficiency
8. Challenge
9. Evidence Matrix
10. Versioning / persistence

External official-source integration belongs inside Layer 2 (Repository Layer) and feeds the existing `RawSource` contract. It must not bypass ranking, dedupe, `validateConclusions`, Source Sufficiency, Challenge, provenance, `generation_conclusions`, `blocked_conclusions`, or `trusted_sources`.

## Existing local repositories

The repository layer reads from local Supabase data:

- laws (`law_full_text`, `federal_law`, placeholders)
- court practice (`court_practice`, `vs_review`)
- FNS letters (`fns_letter`)
- Minfin letters (`minfin_letter`)
- Ekaterina practice
- manuals/templates

PR #32 extends retrieval for these local repositories with exact metadata, content/context terms, semantic intent and search hypotheses while preserving the existing embedding/ranking path.

## Official Source Safety Contract

The same contract applies to every external provider:

- `official_origin_verified`
- `document_identity_verified`
- `content_verified`
- `actuality_status`
- `substantive_use_allowed`
- `verification_level`

An official URL or official search result alone is not substantive legal authority. A standalone external result may enter the substantive source pool only after the contract permits substantive use. Discovery-only metadata can instead verify/link a matching substantive local KB document through canonical identity.

External provider rollout is opt-in: `OFFICIAL_LEGAL_SOURCES_ENABLED` defaults to OFF when absent.

## Semantic Legal Research Contract

`ResearchQuery` has four search-only fields in addition to established facts/requisites:

- `semantic_intents`
- `legal_concepts`
- `metadata_terms`
- `search_hypotheses`

These fields expand retrieval by legal meaning and context. They are deliberately separate from `facts`: an AI-generated research hypothesis may cause a search, but it cannot become an established fact or support a conclusion without an independently retrieved source and the existing downstream quality gates.

Search now combines:

- exact requisites / article metadata;
- metadata fields;
- content / keyword context;
- semantic embedding;
- legal issues and research topics;
- search-only semantic intent/hypotheses.

## Provider registry

### publication.pravo.gov.ru

The official publication portal documents a read-only JSON API. `/api/Documents` is used for exact requisites and documented `DocumentText` context search; `/api/Document` is used for extended metadata by electronic publication number.

Important: the API metadata is not treated as the full legal text. Therefore current Pravo results are discovery/verification records and cannot independently support a legal conclusion. They can enrich a canonically matched local substantive law source.

Federal-law matching uses exact number plus date when the date exists in the research context. A bare repeated number never receives an invented year/date; multiple matches remain ambiguous.

### nalog.gov.ru / FNS

Registered as an official provider/domain. No undocumented JSON/API endpoints are used. A machine-readable adapter can be added only after a documented/allowed interface is established; otherwise documents remain controlled KB imports.

### minfin.gov.ru / Minfin

Registered under the same safety contract. No undocumented adapter is enabled.

### vsrf.ru / Supreme Court

Registered under the same safety contract. No undocumented search API or hidden scraping is enabled.

### kad.arbitr.ru / arbitration cases

Registered under the same safety contract. No reverse-engineered API or hidden scraping is enabled.

## Canonical linking / dedupe

External discovery records and local sources are linked where a deterministic canonical identity can be built, such as:

- document number + document date;
- case number;
- code + article.

This prevents an unverified external metadata card from competing with the same substantive document already present in the local KB.

## Fail-safe rules

- External-source outage must never break local-KB legal analysis.
- Only exact registered HTTPS official hosts are accepted; lookalike domains are rejected.
- Search hypotheses never mutate `facts`.
- Discovery-only external sources do not enter substantive conclusions.
- No DB schema changes.
- No changes to generator/reviewer/document-intake core.
- No undocumented FNS / Minfin / VS / KAD API use.
- No production deployment from this PR.

## Verification

Temporary branch-only GitHub Actions verification was run and then removed from the final diff. Checks:

- `bun install --frozen-lockfile`
- Official Source / Semantic Research contract tests
- `bun run typecheck`
- `bun run build`

The successful run passed all contract tests, typecheck and build.
