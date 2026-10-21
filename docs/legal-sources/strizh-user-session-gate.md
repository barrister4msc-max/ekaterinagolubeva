# Prompt 08P — Strizh authorized user-session gate

This stage is an offline precondition boundary. It does not launch a browser,
create a worker, perform login, call Strizh, or access external services.

The gate fails closed unless it receives exactly one current attestation for each
required kind:

- lawful automation terms;
- threat model;
- credential lifecycle.

Each attestation must be a structured `08P-v1` receipt from the
`kati_security_registry`, with `status=approved`, trusted-registry
verification, a bounded identifier/receipt, and a non-expired validity window.
Caller-provided strings or IDs are not approval evidence.

The credential reference must use the scoped form
`secret://strizh/user-session/<opaque-id>`. Passwords, cookies, tokens and
secret values are never accepted by the model or returned as evidence. Only
allowlisted actions are representable: `search`, `open`, and `download`.
CAPTCHA bypass, fingerprint evasion, frontend credentials and arbitrary browser
control are outside the contract.

Even when the gate returns `ready`, `browser_worker_allowed` remains
`false`. A separately approved adapter stage must still implement per-user and
workspace isolation, short-TTL session storage, CSRF/session handling,
reauthentication/MFA, rate limiting, audit, logout/revoke and prompt-injection
isolation. The trusted registry remains the authority for issuing attestations;
this pure function only validates the admission contract and cannot mint them.
