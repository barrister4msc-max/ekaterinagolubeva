# Official Legal Sources Layer — read-only audit baseline

Date: 2026-08-17
Baseline examined: `main` (`analyze-document-legal-position` pipeline)

## Existing pipeline

`analyze-document-legal-position/index.ts` currently executes:

1. Fact extraction
2. Repository search
3. Ranking
4. Dedupe / caps
5. Gemini Pro
6. Registry merge
7. Source enrichment / conclusion validation / sufficiency
8. Challenge
9. Evidence Matrix
10. Versioning / persistence

External official-source integration belongs inside Layer 2 (repository search) and must feed the existing `RawSource` contract. It must not bypass ranking, dedupe, `validateConclusions`, source sufficiency, challenge, provenance, `generation_conclusions`, `blocked_conclusions`, or `trusted_sources`.

## Current source repositories

The existing repository layer reads from local Supabase data:

- laws (`law_full_text`, `federal_law`, placeholders)
- court practice (`court_practice`, `vs_review`)
- FNS letters (`fns_letter`)
- Minfin letters (`minfin_letter`)
- Ekaterina practice
- manuals/templates

There is currently no direct official-source HTTP adapter in Layer 2.

## Verified official sources

### publication.pravo.gov.ru

The official publication portal documents a read-only JSON API. `/api/Documents` searches officially published legal acts and `/api/Document` returns extended metadata by electronic publication number. This is suitable for a direct server-side adapter.

### vsrf.ru

The official Supreme Court site publicly exposes the judicial-act search UI and document pages. No stable public JSON API contract was identified in this audit. This PR therefore must not depend on undocumented endpoints.

### nalog.gov.ru

The FNS official site exposes official documents and a dedicated service for letters mandatory for tax authorities. No stable public JSON search API for that document corpus was identified in this audit. This PR therefore must not invent one.

### kad.arbitr.ru

The official arbitration case-card system is publicly available, but no documented public API contract was identified in this audit. No scraping or reverse-engineered API is introduced here.

## Safety constraints

- External-source outage must never break local-KB legal analysis.
- Only HTTPS official domains are accepted.
- External results enter the same ranking, dedupe and provenance path as local sources.
- No DB schema changes.
- No changes to generator, reviewer or document-intake core.
- No undocumented KAD / VS / FNS API use.
- No production deployment from this PR.
