# Phase 9 RLS and Database Isolation Design

**Date:** 2026-04-22

**Goal**

Harden Vision's database isolation boundary by introducing the smallest durable tenant-scoped proof surface required to exercise PostgreSQL row-level security, separating runtime and admin database roles, and proving that same-tenant access succeeds while cross-tenant and missing-context access fail closed at the database layer.

## Scope Boundary

Phase 9 is a database-isolation hardening slice only.

It introduces:

- a dedicated tenant-scoped proof table for RLS enforcement
- PostgreSQL helper objects needed to consume trusted DB execution context
- explicit runtime-role hardening and least-privilege grants
- enforced row-level security policies backed by trusted DB context
- database integration and security tests that prove the isolation boundary

It does not introduce:

- tenant provisioning tables or provisioning workflows
- branch CRUD or internal-user CRUD
- entitlement, subscription, or onboarding persistence
- support-grant or platform tenant-entry bypass flows
- auth/session tables as the RLS proof surface
- temporary superuser-style runtime credential shortcuts

## Why This Slice Exists

Phase 8 established trusted tenancy execution context and transaction-local DB settings, but PostgreSQL is not yet enforcing tenant isolation on any tenant-scoped table. The roadmap and blueprint are explicit that tenant isolation is incomplete if it exists only in request logic and service discipline.

The current live schema contains only infrastructure tables:

- `app_metadata`
- `auth_subjects`
- `auth_sessions`
- `auth_assurance_challenges`
- `auth_mfa_totp_factors`
- `auth_mfa_backup_codes`
- `auth_account_events`

Those tables are not the correct Phase 9 proof surface:

- `app_metadata` is not tenant-scoped
- auth tables must remain usable before tenant-scoped execution is resolved
- forcing RLS onto auth/session tables now would mix authentication concerns into the tenancy-hardening slice

Phase 9 therefore needs one narrow, durable, non-auth, tenant-scoped database object whose only job is to prove that the database itself now enforces tenant isolation.

## Exact Phase 9 Proof Surface

Because the live schema does not yet contain real tenant-scoped business tables, Phase 9 will introduce a dedicated infrastructure proof table:

- `tenant_rls_probes`

This table is intentionally narrow and non-domain. It exists to prove the database-isolation contract before Phase 10 and Phase 11 introduce real tenant and branch business persistence.

### `tenant_rls_probes`

Purpose:

- provide a durable tenant-scoped table that is not part of auth/session behavior
- allow the runtime role to perform same-tenant reads and writes through real SQL
- allow tests to prove that cross-tenant reads and writes fail at the PostgreSQL layer

Required columns:

- `id`
- `tenant_id`
- `probe_key`
- `probe_value`
- `created_at`
- `updated_at`

Recommended invariants:

- `tenant_id` is always required
- `(tenant_id, probe_key)` is unique to keep test fixtures deterministic
- all writes are durable and replayable through migrations and reset flows

This proof surface is deliberately minimal:

- no tenant master table
- no branch table
- no internal-user table
- no entitlement model
- no support-access model

## Architecture

Phase 9 builds directly on the Phase 8 boundary:

1. `packages/tenancy` resolves trusted internal tenancy context.
2. `packages/db` applies transaction-local DB settings derived from that trusted context.
3. PostgreSQL policies consume the trusted DB setting they require.
4. The runtime role can query only what the policies allow.

The enforcement chain must therefore be:

1. authn session resolution
2. tenancy resolution
3. authz decision
4. `withDatabaseAccessContext(...)`
5. PostgreSQL RLS policy evaluation

No policy may depend on:

- URL slugs
- route parameters
- request payload tenant values
- app-side `where tenant_id = ...` filtering as the real guardrail

App-side filters may still exist for query shaping and performance, but they are not the trust boundary.

## Runtime DB Role Hardening

Phase 9 makes the runtime/admin credential split operational instead of documentary.

### Role identities

- the runtime role is the PostgreSQL role referenced by `DATABASE_URL`
- the admin role is the PostgreSQL role referenced by `DATABASE_ADMIN_URL`
- migration tooling must use admin credentials pointed at the application database, not the maintenance database and not the runtime URL

### Runtime role requirements

The runtime role must satisfy all of the following:

- `NOSUPERUSER`
- `NOBYPASSRLS`
- `NOCREATEDB`
- `NOCREATEROLE`
- `NOREPLICATION`
- no ownership of protected tables
- no table-definition or policy-definition privileges on protected tables

### Table ownership

Protected tables must be owned by the admin/migration role, not the runtime role.

That applies to:

- the new `tenant_rls_probes` table
- any existing table that the runtime role needs to touch after the Phase 9 reset/bootstrap flow

### Least-privilege grants

The runtime role should receive only the privileges needed for current application behavior:

- `CONNECT` on the application database
- `USAGE` on the schemas it must read from
- `SELECT`, `INSERT`, `UPDATE`, and `DELETE` only on the tables the current runtime path uses

Phase 9 does not need blanket grants such as:

- ownership
- `ALTER`
- `TRUNCATE`
- `CREATE` on application schemas
- `BYPASSRLS`

### Migration/tooling implication

From Phase 9 onward, schema migrations cannot run through `DATABASE_URL`, because the runtime role must not own or manage the protected tables.

Migration application must instead use admin credentials pointed at the target application database that `DATABASE_ADMIN_TARGET_DB` identifies.

## Trusted DB Context Contract

Phase 8 already propagates these transaction-local settings:

- `vision.tenant_id`
- `vision.branch_id`
- `vision.subject_id`
- `vision.subject_type`
- `vision.session_id`

Phase 9 policies consume only one of them:

- `vision.tenant_id`

### Policy-consumed settings

#### `vision.tenant_id`

Meaning:

- trusted tenant execution context derived from Phase 8 tenancy resolution

Usage:

- required for all tenant-scoped `SELECT`, `INSERT`, `UPDATE`, and `DELETE` on the Phase 9 proof table

Mandatory:

- yes

Failure behavior:

- missing, blank, or malformed values must fail closed

### Settings not consumed by Phase 9 policies

These settings remain part of the DB access-context payload but are not policy inputs yet:

- `vision.branch_id`
- `vision.subject_id`
- `vision.subject_type`
- `vision.session_id`

They may remain useful for later audit, branch-scoped policies, or support-access hardening, but Phase 9 RLS must not silently depend on them.

### Fail-closed helper boundary

Phase 9 should introduce a small PostgreSQL helper function, for example `vision.require_tenant_id()`, that:

- reads `current_setting('vision.tenant_id', true)`
- trims and validates the value
- raises a permission-style error when the setting is missing, blank, or malformed
- returns the tenant ID only when it is valid

Policies must consume that helper result rather than repeating `current_setting(...)` logic inline.

## RLS Policy Shape

Phase 9 applies RLS only to the dedicated proof surface:

- `tenant_rls_probes`

### RLS activation

The table must have:

- `ENABLE ROW LEVEL SECURITY`
- `FORCE ROW LEVEL SECURITY`

`FORCE ROW LEVEL SECURITY` is required so ownership does not accidentally create a bypass path.

### Policy contract

Phase 9 must cover both read and write paths.

Recommended policy shape:

- `SELECT`: `USING (tenant_id = vision.require_tenant_id())`
- `INSERT`: `WITH CHECK (tenant_id = vision.require_tenant_id())`
- `UPDATE`: `USING (tenant_id = vision.require_tenant_id()) WITH CHECK (tenant_id = vision.require_tenant_id())`
- `DELETE`: `USING (tenant_id = vision.require_tenant_id())`

This creates the required behavior:

- same-tenant rows are visible
- same-tenant inserts and updates succeed
- cross-tenant rows are not readable
- cross-tenant updates and deletes do not target foreign rows
- inserts that try to stamp a foreign `tenant_id` are rejected by `WITH CHECK`
- missing required tenant context fails closed before access is granted

### Policy data source

The policies may rely only on:

- row `tenant_id`
- trusted DB setting `vision.tenant_id`
- the DB helper that validates that setting

The policies must not rely on:

- request URLs
- route params
- request payload intent
- app-side repository filtering as the real authorization boundary

## Expected Runtime Behavior

### Allowed

- runtime connection with `vision.tenant_id = tenant_a` reads `tenant_a` rows
- runtime connection with `vision.tenant_id = tenant_a` inserts a `tenant_a` row
- runtime connection with `vision.tenant_id = tenant_a` updates a `tenant_a` row

### Denied

- runtime connection with `vision.tenant_id = tenant_a` reading `tenant_b` rows
- runtime connection with `vision.tenant_id = tenant_a` inserting a row stamped as `tenant_b`
- runtime connection with `vision.tenant_id = tenant_a` updating or deleting `tenant_b` rows
- runtime connection with missing tenant context touching the protected table
- runtime role attempts to disable RLS or otherwise manage protected-table policy state

## Required DB Integration and Security Tests

Phase 9 is not complete unless the database test suite proves all of the following against the real runtime role.

### Same-tenant read allowed

Proof:

- seed at least one `tenant_rls_probes` row for `tenant_a`
- use the runtime role with DB context `vision.tenant_id = tenant_a`
- query the table
- assert the `tenant_a` row is returned

### Same-tenant write allowed

Proof:

- use the runtime role with DB context `vision.tenant_id = tenant_a`
- insert a row whose `tenant_id` is `tenant_a`
- update that same row
- assert both statements succeed and the row remains visible to `tenant_a`

### Cross-tenant read denied

Proof:

- seed at least one `tenant_rls_probes` row for `tenant_b`
- use the runtime role with DB context `vision.tenant_id = tenant_a`
- query for the `tenant_b` row
- assert it is not returned

### Cross-tenant write denied

Proof:

- use the runtime role with DB context `vision.tenant_id = tenant_a`
- attempt to insert a row stamped `tenant_b`
- assert PostgreSQL rejects the insert through RLS `WITH CHECK`
- also attempt to update or delete an existing `tenant_b` row
- assert the runtime path cannot mutate that foreign row

### Missing tenant context denied

Proof:

- use the runtime role without `withDatabaseAccessContext(...)`
- query or write against `tenant_rls_probes`
- assert PostgreSQL fails closed because the required trusted context is missing

### Runtime role privilege verification proves no bypass path

Proof:

- query PostgreSQL role metadata and assert the runtime role is not superuser and does not have `BYPASSRLS`
- verify the runtime role does not own `tenant_rls_probes`
- attempt a runtime-role DDL action such as disabling RLS on the protected table and assert it fails

## Documentation Requirements

Phase 9 should update or add documentation in these areas:

- `docs/security/database-role-strategy.md`
- `docs/security/tenancy-execution-context.md`
- `docs/security/README.md`
- a dedicated `docs/security/row-level-security.md` note for the proof-surface and policy contract
- `docs/project/local-development.md`
- a new ADR recording the runtime/admin role split becoming real plus the dedicated proof-surface decision

## Non-Goals

Phase 9 does not include any of the following:

- Phase 10 tenant provisioning workflows
- Phase 11 branch CRUD or internal-user CRUD
- broad platform or support bypass logic
- branch-level RLS policies
- auth/session tables as the RLS proof surface
- temporary runtime credentials with superuser-style powers
- UI work or ERP/public/platform feature work

## Definition of Done

Phase 9 is done when:

- the runtime role is materially weaker than the admin/migration role
- the runtime role is not superuser, does not have `BYPASSRLS`, and does not own the protected table
- the repo has a dedicated tenant-scoped proof table that is not part of auth/session behavior
- PostgreSQL policies consume trusted DB context instead of route intent or app-side filtering
- `tenant_rls_probes` has `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`
- same-tenant reads and writes succeed through the runtime role
- cross-tenant reads and writes fail through the runtime role
- missing tenant context fails closed
- tests prove there is no obvious runtime-role bypass path
- no Phase 10 or Phase 11 domain modeling has been pulled forward

Phase 9 is not complete because a tenant filter exists in application code. It is complete only when the database itself rejects the wrong tenant access under the hardened runtime role.
