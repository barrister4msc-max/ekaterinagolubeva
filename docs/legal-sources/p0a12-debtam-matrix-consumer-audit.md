# P0-A12 — DEBTAM factual matrix consumer/persistence audit

Scope: additive persistence of the already-verified P0-A11 DEBTAM canonical identity/matrix into `document_intake_ai_runs.ai_result` and `input_snapshot` only.

## Consumer audit

The existing legal-analysis client contract reads `ai_result` as a JSON object and projects named legal-analysis fields. `MatterSnapshot` is an explicit projection of legal facts, `trusted_sources`, legal `evidence_matrix`, conclusions, sufficiency, challenge, hashes and generation decisions. Unknown additive `ai_result` fields are not copied into the generator-facing `MatterSnapshot` unless explicitly added to that projection.

Therefore P0-A12 does **not** add DEBTAM fields to `MatterSnapshot`, `generate-legal-document-v2`, the document context builder, legal Evidence Matrix, provenance, Source Sufficiency or Challenge.

The new persisted fields are intentionally separate:

- `company_tax_debt_evidence` — P0-A10 structured point-in-time factual evidence;
- `company_tax_debt_factual_evidence_matrix` — P0-A11 exact identity matrix;
- `company_tax_debt_factual_identity` — reconstructable canonical facts + exact evidence links + diagnostics;
- `company_tax_debt_factual_matrix_diagnostics` — audit diagnostics in input snapshots.

Existing SNR fields remain separate and unchanged:

- `company_factual_evidence`;
- `company_factual_evidence_matrix`;
- `company_factual_identity`.

## Safety invariants

DEBTAM persistence must remain outside all legal/model paths:

- never passed to `buildPrompt` / model input;
- never passed to `buildConclusionsAndIndex` / `validateConclusions`;
- never passed to `evaluateSufficiency`;
- never passed to `runChallenge`;
- never inserted into `RawSource` / `TrustedSource`;
- never merged into the canonical `FactRecord↔document` `evidence_matrix`;
- never treated as a live/current balance.

The DEBTAM matrix preserves:

- `matrix_scope = company_tax_debt_factual`;
- `relation = DIRECTLY_RECORDS`;
- `identity_match = exact`;
- `observation_scope = point_in_time_not_live_balance`;
- `legal_authority = false`;
- `substantive_use_allowed = false`;
- `use_as_legal_source = false`;
- `current_balance_claim_allowed = false`.

## Persistence paths

The same factual matrix must be auditable in:

1. no-usable-documents `ai_result`;
2. no-usable-documents `input_snapshot`;
3. pre-model `input_snapshot` (so later model failure does not erase the factual audit trail);
4. successful final `ai_result`;
5. successful final `input_snapshot`.

P0-A12 also removes the inherited duplicate DEBTAM evidence/diagnostics keys in the pre-model/final input snapshots. No Production/Preview deployment or real FNS import is part of this stage.
