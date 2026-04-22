# ADR 0005: Transaction-Local Tenancy Context

## Status

Accepted

## Context

Phase 8 needs trusted tenant and branch execution context to cross the boundary from API request handling into PostgreSQL without relying on route-local filtering. Phase 9 row-level security will depend on a consistent DB-visible context, but Phase 8 must keep `packages/db` thin and avoid hidden policy logic.

## Decision

Vision will propagate trusted tenant-scoped execution context into PostgreSQL transaction-local settings before tenant-scoped work executes.

The payload comes from resolved internal ERP tenancy context and includes:

- tenant ID
- branch ID when present
- subject ID
- subject type
- session ID

`packages/db` will expose infrastructure helpers that set these values for the current transaction or connection scope. The helper will fail closed when tenant context is missing.

## Consequences

- tenant-scoped DB work must run through the DB access-context helper
- DB context setup remains infrastructure, not authorization policy
- API and service layers remain responsible for tenancy resolution and authz
- Phase 9 can build RLS on top of the same trusted DB context contract
