# Prompt 08N — CBR manual/import adapter

This stage adds one bounded provider route for Bank of Russia documents through the
existing provider-neutral research admission contract.

The adapter accepts only manually supplied HTTPS references on `cbr.ru` or
`www.cbr.ru`. It preserves the CBR source family separately from laws and court
practice, including document kind, effective status/date, language, version,
withdrawn/draft flags, duplicate publication identity and full-text availability.

A document marked `full_text_available: true` must include the supplied full text.
No official host is treated as verification; all imports remain discovery-only with
`substantive_use_allowed=false`. Draft or withdrawn material cannot prove currently
effective law.

No HTTP request, API call, scraping, CAPTCHA bypass, inference, database write,
migration, consumer switch, Preview or Production deployment is performed.
