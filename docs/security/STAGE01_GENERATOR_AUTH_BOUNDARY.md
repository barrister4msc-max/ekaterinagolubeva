# Stage 01 — Generator authorization boundary

Scope: `generate-legal-document-v2` only.

## Verified pre-change failure

The Edge Function runs with `verify_jwt = false`, creates a service-role Supabase client, accepts client-supplied session/run/legal-analysis identifiers, calls Gemini, and persists a generated document without first authenticating the caller or binding the legal-analysis run to the same intake session.

## Implemented boundary

Before request identifiers are trusted or any external model call is possible, the handler now:

1. requires a Bearer token;
2. resolves the actor with `auth.getUser(accessToken)`;
3. requires the existing `is_admin_or_superadmin` role boundary;
4. resolves the requested intake session server-side;
5. rejects a non-null `created_by` belonging to a different actor;
6. verifies template/jurisdiction/language against the persisted session;
7. requires `legal_analysis_run_id` when client legal analysis is supplied;
8. resolves only a `legal_analysis` / `completed` run for the same session;
9. uses persisted `document_intake_ai_runs.ai_result` as the legal-analysis object instead of the client copy;
10. records only actor/session/matter/run identifiers in the auth audit log;
11. writes `generated_legal_documents.created_by = user.id`.

## Compatibility note

A read-only schema audit on 2026-08-29 found `document_intake_sessions.created_by` exists but all current 121 session rows have `created_by IS NULL`. Therefore Stage 01 does not invent a migration or retroactive owner mapping. Current access scope remains the existing admin/super-admin boundary; future sessions with a populated `created_by` are additionally owner-bound.

## Explicit exclusions

- no migration;
- no RLS/gateway change;
- no AI-fill change;
- no prompt/model change;
- no Reviewer change;
- no live inference;
- no Production deployment.
