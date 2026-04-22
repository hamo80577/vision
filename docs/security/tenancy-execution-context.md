# Tenancy Execution Context

Phase 8 introduces trusted internal ERP tenancy execution context for Vision.

## Boundary

- `packages/tenancy` owns raw route intent, resolution invariants, machine-readable tenancy error codes, and DB-context mapping.
- `apps/api` owns request adaptation: route intent extraction, tenancy guard execution after authn, tenancy-aware authz input, and HTTP error mapping.
- `packages/authn` owns session persistence for active branch switching and the related audit event.
- `packages/db` only applies trusted DB access context inside a transaction or connection. It does not infer tenant policy or hide filters.

Phase 8 does not introduce tenant provisioning, branch CRUD, support-grant flows, or public website tenant resolution.

## Request Lifecycle

Tenant-scoped internal requests must follow this order:

1. request parse and raw route intent extraction
2. authn session resolution
3. tenancy resolution and validation
4. authz decision
5. application service execution
6. DB access-context application before tenant-scoped queries

Tenancy is trusted state only after Step 3.

## Raw Intent Versus Trusted State

Intent-only inputs:

- path params
- slug values
- host-derived values
- query params
- payload values, including branch-switch targets

Trusted inputs:

- authenticated internal session identity
- session `activeTenantId`
- session `activeBranchId`
- trusted active-tenant access snapshot

Intent may request scope, but it never establishes tenant or branch context by itself.

## ERP Invariants

Phase 8 resolved ERP context must satisfy all of the following:

- tenant scope requires `activeTenantId` and `targetTenantId`
- branch scope requires a valid tenant context plus a valid branch context
- global scope must stay outside internal tenancy resolution
- `targetTenantId` must equal `activeTenantId`
- `targetBranchId` may differ from `activeBranchId` only during the dedicated branch-switch flow before persistence
- platform tenant, branch, and branch-switch execution deny by default

## Branch Switching

Branch switching is a controlled session-context mutation.

- allowed actors: authenticated internal ERP users with an active tenant context
- validation: target branch must be explicit, must belong to the active tenant-scoped access snapshot, and must be authorized before persistence
- flow: dedicated route intent -> tenancy validation -> `switch_context` authz -> session persistence -> audit
- persistence point: session update happens in `packages/authn` only after tenancy validation and authz succeed
- audit requirement: successful switches write a durable `branch_context_switched` event
- failure behavior: fail closed, no partial session mutation

## DB Context

Tenant-scoped DB work must use trusted access context derived from resolved tenancy:

- `vision.tenant_id`
- `vision.branch_id`
- `vision.subject_id`
- `vision.subject_type`
- `vision.session_id`

Missing tenant DB context is an error and must fail closed.

## Error Model

Phase 8 tenancy denial codes:

- `unsupported_execution_surface`
- `platform_tenant_execution_disabled`
- `missing_active_tenant_context`
- `missing_active_branch_context`
- `tenant_intent_mismatch`
- `branch_intent_mismatch`
- `invalid_branch_switch_target`
- `branch_not_in_active_tenant_scope`
- `tenant_db_context_required`
