# AI-fill baseline v1 — offline audit record

## Purpose and boundary

This record implements Prompt 09 of `KATI-MASTER-V5-UNIFIED`: preserve an
auditable quality baseline for the existing AI-fill path before any new
ingestion, mapper, model, prompt, packing, schema, or write-policy work.

It contains no client document, prompt content, provider request, model output,
or user answer. It does **not** claim model-quality non-regression. That claim
requires the approved anonymised corpus and lawyer assessment described below.

## Frozen implementation slice

- Repository commit: `4e6f813ae399985b8946dc87ac4f32cae95710be`
- AI-fill Edge Function: `document-intake-ai-fill`
- Endpoint source SHA-256: `fffea547da7371cbd9b5a052a7357c5f59c3759c48fcdd501cc16ff1d2f19bb5`
- Auto-start decision layer SHA-256: `3d0d77b5b107984cdfd333ad75fa8fe51d682e85d0dbbc234abce68638b51f2e`
- Redaction mapping SHA-256: `06d8f8fd801b346e61d055cd7e98b403fecf5830e5e9f968551b457ad2ddfcb1`
- Current provider path: the existing Gemini `generateContent` path and its
  configured bounded fallback list; no new provider is selected by this record.

## Existing executable coverage

| Behaviour | Existing test evidence | Baseline status |
| --- | --- | --- |
| Authorization before session/document reads | `document-intake-ai-fill-auth.test.ts` | Covered |
| Session/document ownership and package handling | `document-intake-ai-fill-auth.test.ts` | Covered |
| OCR/extraction retry | `document-intake-retry.test.ts` | Covered |
| Safe model-facing document preparation | `pr22-ai-fill-wiring.test.ts` | Covered |
| Auto-start, one run per set, partial OCR, duplicate prevention | `pr32-auto-ai-fill-redaction.test.ts` | Covered |
| Redaction token/canonical restoration | `pr32-auto-ai-fill-redaction.test.ts` | Covered |
| A rerun preserves a non-AI answer source | `document-intake-ai-fill-auth.test.ts` | Covered by regression test |
| Field semantics, negations, citations, conflicts, completeness | Approved corpus absent | Not benchmarked |
| Repeated-run variation | Approved corpus absent | Not benchmarked |

## Required anonymised corpus and lawyer annotation

Each approved case records: document revision/hash, template and schema
revision, prompt source SHA-256, provider, model, run ID, and the current
AI proposal. For every assessed field the lawyer records:

- result: `correct`, `incorrect`, `unsupported`, `unknown`, or
  `manual_preserved`;
- accepted final value (if it differs from the proposal), document role and
  source quote reference;
- whether a negation and a conflict were preserved;
- whether a citation is authentic and applicable;
- whether a manual answer was retained.

Free text is evaluated for meaning, not merely field count. Repeated runs are
recorded separately so variation is measurable rather than averaged away.

Required initial coverage: supported identity, document role, negation,
conflicting documents, unknown/unsupported data, and an existing manual answer.
`fixtures/ai-fill-baseline-v1.synthetic.json` is a synthetic annotation
template for exactly those conditions. It is not an approved corpus and must
not be sent to a provider as an implied production test.

## Baseline metrics

Report by field and template:

- correctness; role correctness; negation preservation; source-quote fidelity;
  completeness; conflict handling; and manual-edit preservation;
- false fills, omissions, unsupported values, and citation failures;
- for repeated runs: case-level variation, not a single blended score.

## Current conclusion and STOP

The manual-answer overwrite defect found during the initial audit has been
repaired and is regression-tested in `main` by PR #111. No quality
non-regression statement is yet valid: no approved anonymised corpus, recorded
current outputs, or lawyer annotations are available.

Prompt 10 and later stages remain blocked until those materials are recorded.
Do not change the existing prompt, model, packing, schema, or write policy as
part of this baseline work.
