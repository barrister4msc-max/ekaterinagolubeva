# 09C-1 — Expert synthetic ground truth

This is an offline, expert-authored semantic fixture for the existing AI-fill
evaluation contract. It contains no client document, provider request, model
output, runtime write, or production artifact.

Its five cases cover the approved flagship templates and the minimum semantic
conditions: supported fields with provenance, negation, unresolved conflict /
unknown value, and an explicitly accepted manual value. Each case is marked
`expert_synthetic`, `lawyer_reviewed=false`, and
`eligible_for_model_accuracy_claim=false`.

It validates rubric semantics only. It must not be used to calculate accuracy,
claim non-regression, select a model, enable a consumer, or replace the
approved anonymized case + recorded output + lawyer-review workflow in Q0.
