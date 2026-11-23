# 08M — ВС РФ manual document adapter

This stage adds a manual/import-only adapter for official Supreme Court references.

It accepts only HTTPS URLs on `vsrf.ru`, `www.vsrf.ru`, `supcourt.ru` or
`www.supcourt.ru`, and preserves act-level metadata:

- case card versus court act/review/plenum/individual act;
- court instance;
- complete, redacted, incomplete or missing text;
- adverse and later-act flags.

The adapter emits the existing `external_research_imports` contract with
`provider=vsrf`. Imported material remains an unverified discovery candidate:
the official host is not verification and `substantive_use_allowed=false`.

No HTTP request, scraping, API call, CAPTCHA bypass, inference, database write,
consumer switch or deployment is performed. Automatic VS/SudRF transport is a
separate future gate; KAD/BRAS remains the existing browser handoff.
