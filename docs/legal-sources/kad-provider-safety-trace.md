# КАД provider safety/TRACE gate

Status: Draft PR only. No automatic KAD transport is enabled.

## Allowed operating modes

KAD (kad.arbitr.ru) is accepted only through:

- user_session — a user opens the official site and supplies the result;
- manual — a user enters or confirms the case metadata;
- import — a user imports an official page/document obtained through an allowed session;
- discovery_only — metadata is retained only to locate or verify a source.

## Explicitly prohibited

The provider must not use:

- reverse-engineered or undocumented endpoints;
- cookie/session impersonation;
- header or rate-limit bypasses;
- hidden scraping;
- automatic requests based only on an AI-generated hypothesis.

If an official documented API or licensed interface is established later, it must receive a separate provider audit and safety review.

## Safety boundary

Every accepted KAD candidate is marked:

- source_type = kad_case;
- source_family = judicial;
- legal_authority = false;
- substantive_use_allowed = false;
- search_inference_only = true.

The candidate remains a factual/retrieval observation. It cannot independently support a legal conclusion or enter generation. It must continue through canonical identity, provenance, ranking, source sufficiency, challenge and the existing conclusion validation pipeline.

SEARCH INFERENCE != CASE FACT: an inferred query or a search result does not establish facts of the user's matter.

## Required identity

At least one of the following is required:

- a normalized arbitration case number;
- a human-confirmed title.

The URL must be HTTPS and must use only kad.arbitr.ru or www.kad.arbitr.ru.

## Next verification

After CI is green, a separate Git-driven Preview may test only synthetic/manual import fixtures. No real user case data is needed, and no Production merge/deploy is implied.
