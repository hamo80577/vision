# Tenancy Execution Context

Phase 9 keeps the DB-side tenancy contract intentionally small.

## Boundary

- `packages/tenancy` owns tenant intent extraction, validation, and application-layer tenancy errors.
- `packages/db` only applies trusted DB session settings needed for tenant-scoped queries.
- Phase 9 RLS policy input is `vision.tenant_id` only.

## Request Lifecycle

Tenant-scoped internal requests must follow this order:

1. request parse and raw route intent extraction
2. authn session resolution
3. tenancy resolution and validation
4. authz decision
5. application service execution
6. DB access-context application before tenant-scoped queries

Tenancy is trusted state only after Step 3.

## Trusted DB Input

Tenant-scoped DB work must set `vision.tenant_id` before querying protected tables.

`vision.require_tenant_id()` reads that setting, validates that it is present, and returns the current tenant id for policies.

## Non-Goals

Application services may still carry richer tenancy state, but the database policy contract depends only on `vision.tenant_id`.

The branch-switch HTTP route remains responsible for tenancy resolution and authorization. The auth service now also rejects switch targets that are not present in the caller-provided allowed-branch snapshot, so accidental reuse of the persistence method cannot silently move a session into an unauthorized branch.
