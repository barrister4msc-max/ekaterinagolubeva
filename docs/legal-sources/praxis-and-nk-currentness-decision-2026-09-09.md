# Praxis admission and NK I/II currentness decision — 2026-09-09

## Decision

Praxis is not admitted as a substantive legal-source provider and its bundled corpus must not update KATI's Tax Code knowledge base.

Praxis remains eligible only for optional shadow capabilities after KATI retrieval:

1. cross-encoder reranking of KATI's top-N candidates;
2. graph expansion of explicit norm-to-norm references;
3. NLI/citation-entailment signal for a thesis against a quoted fragment.

These capabilities may neither create a TrustedSource nor grant substantive use. Their outputs return through the existing RawSourceCandidate / Canonical Source Metadata Bridge and all KATI verification, actuality, temporal, authority and SourceUse gates.

## Why the Praxis corpus is not a legal source

Praxis documents that its code corpus is a Wikisource transcription and must be checked against pravo.gov.ru. Its current repository history does not prove continuous consolidated-text updates through the date of this decision. That is sufficient for discovery or benchmarking, but not for representing a provision as the current authoritative text.

Accordingly, do not register Praxis as an independent source family and do not create a second knowledge, reasoning, evidence or conclusion engine.

## NK I/II Production update contract

The existing `scripts/law7_mirror_import.py` remains the only writer to `law7_mirror`. PR #40 temporary Preview SQL migrations are not a Production import payload and must not be replayed in Production.

The Production path is:

`read-only Law7 export (NK_RF + NK_RF_2) → normalized JSON → identity/integrity/currentness-attestation gate → reviewed payload SHA256 → existing importer --apply → read-only post-import audit`.

The workflow must fail closed unless all of the following are true:

- only `NK_RF` and `NK_RF_2` are present;
- source revision is immutable;
- the reviewed normalized payload SHA256 matches exactly;
- the originating acts are identified as 146-ФЗ of 1998-07-31 and 117-ФЗ of 2000-08-05;
- each code points to an official pravo.gov.ru resource;
- text is nonblank and every text hash matches;
- no duplicate version key or multiple current version exists;
- an actuality check against official acts was recorded no more than 14 days before import;
- the protected `production` environment approves the job;
- `LAW7_PRODUCTION_MIRROR_DATABASE_URL` is available;
- the operator enters the exact Production confirmation.

Importing a corpus does not itself set `official_origin_verified`, `content_verified`, `temporal_verified` or `substantive_use_allowed` to true. Retrieval availability is not legal reliability.

## Current stop condition

The Preview snapshot with SHA256 `70a1d8fc6b27b67ad7f12f03f017d02b5f68a0c895447159039800965895f8b2` is technically internally consistent, but it does not pass the currentness gate: the available metadata has identity defects, no official URLs, no verified amendment history, and no current official-text verification record. Production must remain unchanged until a corrected and reviewed export plus the dedicated Production DB execution path are available.
