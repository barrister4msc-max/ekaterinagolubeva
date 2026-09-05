# 09C-2 — Q0 controlled Preview capture protocol

Before a real recorded AI-fill output can be collected, one admission record
must pass the offline preflight contract. It requires:

- a verifiable Preview deployment identity, never Production;
- exactly one `expert_synthetic` or approved anonymized case;
- `test_only=true`, no real client data and no accepted writes;
- safe telemetry only, a correlation identifier and mandatory cleanup after
  the run.

This protocol does not execute a model request. It does not approve a live
run, does not store an output and does not change Q0 status. A controlled
Preview run still needs explicit authorization and a proven Preview/Production
separation before it may happen.
