# Prompt 08P — Strizh authorized user-session gate

Strizh browser/session execution is blocked until three independently approved
attestations exist: lawful automation terms, threat model, and credential
lifecycle. The gate also requires an encrypted credential reference.

Only allowlisted actions are representable: `search`, `open`, and `download`.
Passwords are never accepted by the model. CAPTCHA bypass, fingerprint evasion,
frontend credentials and arbitrary browser control are outside the contract.

This PR is an offline precondition only. It does not launch a browser, create a
worker, perform login, call Strizh, or access external services. Even with all
attestations the result remains non-executable until a separately approved
adapter stage.
