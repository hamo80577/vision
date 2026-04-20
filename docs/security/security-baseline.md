# Security Baseline

Phase 0 and Phase 1 do not implement authentication, authorization, tenancy, or database isolation.

This phase must also not create fake security behavior.

Forbidden in the foundation slice:

- fake login flows
- fake role checks
- hardcoded tenant assumptions
- hidden support or admin bypasses
- UI-only permission demonstrations
- pretend booking, POS, inventory, support, or reporting flows

Later security phases must add real server-side enforcement and tests.
