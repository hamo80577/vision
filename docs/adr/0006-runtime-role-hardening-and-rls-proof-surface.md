# 0006 Runtime Role Hardening And RLS Proof Surface

## Status

Accepted

## Context

Phase 9 needs tenant isolation to be enforced by the database, not just by application code.

The implementation split now distinguishes between a runtime database role and a separate admin/bootstrap role. The runtime role is derived from `DATABASE_URL` and hardened to be least privilege: non-superuser, no `BYPASSRLS`, and not the database owner. The admin role is derived from `DATABASE_ADMIN_URL` and is reserved for reset, migrate, bootstrap, and grant-application paths against `DATABASE_ADMIN_TARGET_DB`.

The product also needs a durable proof surface for row-level security that can be exercised without depending on a business table.

## Decision

Vision uses `tenant_rls_probes` as the dedicated Phase 9 row-level-security proof surface.

`tenant_rls_probes` has `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`, plus explicit `SELECT`, `INSERT`, `UPDATE`, and `DELETE` policies that compare the row tenant id against `vision.require_tenant_id()`.

`vision.require_tenant_id()` validates only `vision.tenant_id` and returns the current tenant id for policy evaluation.

The runtime/admin database split remains part of the contract:

- runtime traffic uses the hardened runtime role from `DATABASE_URL`
- reset/bootstrap paths use `DATABASE_ADMIN_URL` and `DATABASE_ADMIN_TARGET_DB`
- runtime grants stay narrow while bootstrap remains capable of schema recreation and seeding

## Consequences

- Tenant isolation is enforced through a single, easy-to-test policy input: `vision.tenant_id`.
- The runtime role cannot rely on superuser or ownership behavior to make RLS pass.
- RLS verification stays isolated from product-domain schema changes because the proof surface is a dedicated table.
- Local reset and bootstrap flows must continue to use the admin path so the runtime connection remains least privilege.
