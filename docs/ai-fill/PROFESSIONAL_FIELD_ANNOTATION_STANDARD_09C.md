# 09C-3 — professional field-annotation standard

This fixture is an expert-authored synthetic annotation pack for testing the
AI-fill evaluation contract. It is not a real client matter, not a lawyer
review of a model output, and not evidence for accuracy or non-regression.

For each required field, the annotation records:

1. the canonical field meaning, not merely the text that happened to be found;
2. the expected value or explicit absence;
3. the admissible document role;
4. an exact quote and provenance locator;
5. whether a negation or unresolved conflict must survive;
6. whether a manually accepted value must remain unchanged.

The five flagship profiles are covered explicitly:

- response to a tax request: party, authority, request date/number and position;
- tax explanations: party, authority, period and position;
- VAT explanations: party, authority, VAT period and position;
- tax strategy memo: party and unresolved strategy/position;
- tax court position: party, court case number and position.

Annotation rules:

- do not infer a value from a search hypothesis, filename or similar text;
- do not merge values belonging to another party, period or case;
- treat a missing or conflicting value as null/unknown rather than guessing;
- preserve a negation such as “не допускается” as a semantic constraint;
- preserve unresolved conflict and route it to lawyer review;
- use user_manual_input only when the value was explicitly accepted by the user;
- keep every fixture classified as expert_synthetic, lawyer_reviewed=false,
  and eligible_for_model_accuracy_claim=false.

To unlock Prompt 10, these synthetic annotations must later be replaced or
supplemented by a separately approved anonymized corpus, recorded AI-fill
outputs and an independent lawyer's field-level review. This document does
not authorize inference, provider traffic, external source access, or
production use.
