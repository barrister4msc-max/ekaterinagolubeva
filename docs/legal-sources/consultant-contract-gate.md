# Prompt 08O — Consultant contract gate

Consultant integration is blocked until an official contract/documentation package
proves the permitted API endpoint, version, scopes, credential lifecycle, rate
limits, retention and machine-use rights.

This PR adds only a pure offline precondition gate. It does not infer an endpoint,
accept frontend credentials, call Consultant, parse its UI, or create a transport.
Even with complete evidence the result remains non-executable until a separately
approved adapter stage.

Required status before adapter work: `verified`.
Without the package: `blocked_until_contract_verified`.
