# Stage 01 — Reviewer authorization boundary

Scope: `review-generated-legal-document` only.

## Verified pre-change failure

The Reviewer accepted request identifiers before authenticating the caller, created a service-role Supabase client, loaded `generated_legal_documents`, Matter/strategy/documents/intake context, could call Gemini, and could update review state without first binding the request to an authenticated actor or trusted server caller.

## Implemented boundary

Before request identifiers are trusted or any external model call is possible, the handler now:

1. accepts only POST/OPTIONS;
2. requires a Bearer token;
3. preserves the existing Generator auto-review path by recognizing the exact service-role token as a trusted server caller;
4. otherwise resolves the user with `auth.getUser(accessToken)` and requires `is_admin_or_superadmin`;
5. loads the generated document server-side;
6. rejects a populated `generated_legal_documents.created_by` owned by another authenticated actor;
7. derives intake session, Matter and legal-analysis run from persisted generated-document metadata rather than trusting client scope;
8. rejects a populated intake-session owner belonging to another actor;
9. rejects document/session Matter mismatch;
10. rejects a client-supplied `legal_analysis_run_id` that does not match the generated document;
11. if the generated document is bound to a legal-analysis run, accepts only the same-session `legal_analysis` / `completed` run;
12. logs only caller type and actor/document/session/matter/run identifiers.

## Compatibility

Standalone or legacy generated documents without a persisted legal-analysis run remain reviewable by the existing admin/super-admin boundary or trusted server caller. When a persisted legal-analysis run exists, the Reviewer validates it before loading broader Matter context or calling Gemini.

## Explicit exclusions

- no migration;
- no RLS/gateway change;
- no AI-fill change;
- no Reviewer prompt/model change;
- no Generator change;
- no live inference;
- no Production deployment;
- no Stage 02 evidence-relation changes.
