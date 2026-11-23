# E06 hosted Edge smoke checkpoint — 05.11.2026

The authorized task is complete: all six functions from Draft [#219](https://github.com/barrister4msc-max/ekaterinagolubeva/pull/219) were deployed into one temporary Preview, their actual deployed sources matched the candidate, hosted boot/unauthenticated checks passed without model calls, and the Preview was deleted. Full E06 PDF/Storage/authenticated/scheduler acceptance remains open.

## Candidate, target and lifetime

Candidate commit `9832baa97806aca8e612bbde89fd61087ea0b692`, tree `c2dbdd6d669a349aac8b406b10e3f86a1b9ee8d7`. Runtime files are unchanged from code commit `e43dfd1d077dba86a7e731d504eb993e7e5f5fa1`; the intervening change recorded the [01.11 SQL checkpoint](E06_20261101_PREVIEW_SQL_CHECKPOINT.md).

The user explicitly authorized six-function Preview deployment, no model calls, verification and deletion. Supabase's cost-confirmation flow created only `e06-ocr-20261105-temporary`, project ref `hbzeifkjzexkltvktwjc`, branch id `699e456d-1f9d-484e-8c24-77991e677d37`. Created at 15:21:04 CET; deletion confirmed at 15:31:21 CET (Europe/Warsaw).

Target verification did not rely on the old parent-linked function inventory: the Preview's anon key claims contained its own ref; an invalid project ref was denied; every successful deployment and retrieved source had the Preview ref in its entrypoint path. The first hosted dispatcher responded at that Preview's own URL. Production function identities, versions, timestamps and bundle hashes were unchanged before/after all deployments; dispatch/control were not added to Production.

## Deployed source parity

| Function | Preview version | Exact source files compared |
| --- | ---: | ---: |
| extract-document-text | 114 | 10 |
| dispatch-document-ocr | 1 | 10 |
| document-ocr-control | 1 | 10 |
| document-intake-ai-fill | 67 | 6 |
| analyze-document-legal-position | 125 | 64 |
| generate-legal-document-v2 | 92 | 21 |

All 121 packaged file instances matched the downloaded deployed file contents exactly, including shared dependencies. File counts include shared files repeated across packages. Every function retained the candidate's `verify_jwt=false` gateway setting and its in-handler user authorization or dedicated dispatcher-token check. No handler, prompt, model/provider selection or auth rule was changed for this run.

[Structured evidence](evidence/E06_20261105_PREVIEW_EDGE_SMOKE.json) contains receipts, bundle hashes, individual source SHA-256 values, response hashes, hosted execution ids, Production comparison and cleanup inventory. No API key, real token, user document or model response is included.

## Hosted HTTP checks

Twenty distinct cases passed. There were 24 deployed-handler requests including the three initial dispatcher checks and one corrected probe retry; one earlier route probe confirmed the dispatcher was absent before deployment.

| Case | Result |
| --- | --- |
| POST without bearer, all six functions | 401 |
| POST with invalid synthetic bearer, all six | 401 |
| Browser OPTIONS, five user-facing functions | 200/204 with required CORS origin/headers |
| Dispatcher OPTIONS | 405, internal token-only route |
| Dispatcher/control GET | 405 |
| Synthetic body canary echoed in responses | Zero |

All responses came from hosted Supabase Edge Runtime with execution ids. There were no boot failures. The probe initially expected 401 for control GET; its established source contract is 405. Only that probe expectation was corrected and that request repeated successfully. Function sources were unchanged.

A single bounded Preview log query returned zero canary matches in the available logs across nine sources. This is a check of the logs available at query time, not a guarantee about delayed log ingestion. No real credentials, documents or user identities were used by the HTTP probes; all POST requests were rejected before document/Storage/model processing.

No model calls were made by this test. No provider credentials, feature flags or scheduler were configured, and no temporary Auth actors or Storage objects were created. Native-text parsing, successful user authentication, enqueue/claim processing, source replacement and paid OCR/consumer inference were not exercised.

## Database boundary and remaining E06 gate

The new branch's automatic legacy replay again failed after five historical migrations, leaving four public tables and no documents/OCR ledger. The read-only check confirmed zero Auth users and Storage objects.

Automatic approval review rejected the proposed reconstruction package before execution because it included `DROP SCHEMA public CASCADE`, roles/extensions/grants, Storage policies and broad schema/reference-data creation, while the user authorization covered function deployment and no-model checks. The rejection was not bypassed. No manual DDL/reset was applied in this run; the final catalog still had four public tables and no documents/OCR ledger.

Hosted module boot, missing/invalid bearer denial, CORS and method checks do not require that reconstruction. They completed successfully against the unchanged Preview database. The previous 01.11 SQL checkpoint belongs to a different, now deleted environment; combining the two records does not establish an integrated E06 workflow.

Next integration gate: separately authorized empty-Preview schema bootstrap and bounded test actor/Storage setup, followed by positive native-text and source-generation checks; large-PDF OCR, closed-tab scheduling and downstream model stages require their concrete operational/inference scope. E07 Production E2E remains blocked.

## Cleanup

The temporary branch was deleted after capturing source and HTTP evidence. A fresh inventory contains only Production's default `main` branch; its ref remains `wiylzbdbjokignwvizxt`. No paid Preview was left active. There was no Git merge, Production deployment, Production data write or Production configuration change.
