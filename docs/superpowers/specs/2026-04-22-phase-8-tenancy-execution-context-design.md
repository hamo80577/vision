# Phase 8 Tenancy Execution Context Design

**Date:** 2026-04-22

**Goal**

Implement the narrow Phase 8 tenancy core required by the roadmap: trusted internal ERP execution context resolution, explicit active tenant and branch context handling, auditable branch switching, fail-closed tenancy validation, and thin database access-context propagation that prepares Phase 9 row-level security without pulling tenant or branch domain persistence forward.

**Scope Boundary**

This slice implements trusted execution context only.

It does not introduce:

- tenant provisioning tables
- placeholder tenant CRUD
- branch CRUD or branch domain persistence
- onboarding flows
- subscription or entitlement persistence
- support-grant flows
- platform tenant-entry bypasses
- hidden repository filtering or policy logic inside `packages/db`

Allowed schema work in this phase is limited to infrastructure support for session context persistence and auditability where required by the execution-context design.

## Why This Slice Exists

Phase 7 introduced centralized authorization, but tenant and branch context are still only session fields plus ad hoc route facts. The roadmap requires that tenancy become a real execution context before Phase 9 hardens database isolation with row-level security. Phase 8 therefore has one job: turn tenant and branch scope into trusted, explicit, fail-closed runtime context that can be consumed consistently by API guards, application services, observability, and the database layer.

## Architecture

Phase 8 spans four layers with strict responsibilities:

1. `packages/authn` remains the source of authenticated session truth and persists active branch changes after successful validation and authorization.
2. `packages/tenancy` owns raw route intent types, internal ERP tenancy resolution, tenancy invariants, machine-readable tenancy error codes, and mapping from resolved context to DB access context.
3. `apps/api` owns request-to-tenancy adaptation: derive raw route intent, resolve trusted tenancy context after authn, attach it to the request, feed normalized facts into authz, and map tenancy failures to stable HTTP problems.
4. `packages/db` owns thin infrastructure helpers that apply already-trusted DB access context to a transaction or connection. It must not infer tenant policy or hide tenant filters.

The request flow for tenant-scoped internal work is explicit and fixed:

1. request parse and raw route intent extraction
2. authn session resolution
3. tenancy resolution and validation
4. authz decision
5. application service execution
6. DB access-context application before tenant-scoped queries or transactions

No tenant-scoped or branch-scoped application work should skip Step 3. No tenant-scoped DB work should skip Step 6.

## Public Versus Authenticated Context

Phase 8 only defines authenticated internal ERP execution context.

Public tenant resolution is a separate concern and must not be modeled as the same thing:

- public website routing resolves tenant presentation context from host or slug
- internal ERP execution resolves trusted tenant and branch context from the authenticated session plus validated route intent

Phase 8 therefore does not define customer or public execution context inside `ResolvedTenancyContext`. That separation must remain visible in both the type system and the API integration layer.

## Raw Route Intent Versus Trusted State

Phase 8 keeps user intent separate from trusted state.

### Raw route intent

These values are intent only:

- route params
- route slug values
- host-derived values
- query parameters
- request payload values, including requested branch-switch targets

These values may request scope, but they do not establish trusted tenant or branch state.

### Trusted state

These values are trusted state:

- authenticated internal session identity
- session `activeTenantId`
- session `activeBranchId`
- trusted tenant-scoped access snapshot supplied by the application integration layer

Trusted state may reject or normalize route intent. It never yields to route intent silently.

### Mismatch behavior

Outside the dedicated branch-switch flow:

- route tenant intent that does not match `activeTenantId` must fail closed
- route branch intent that does not match `activeBranchId` must fail closed

Inside the dedicated branch-switch flow:

- route branch intent may differ from `activeBranchId`
- the requested target branch must still validate against the active tenant-scoped access snapshot before any persistence occurs

## Phase 8 Type Contract

Phase 8 should expose a small explicit contract in `packages/tenancy`.

```ts
export type RawRouteIntent = {
  surface: "erp" | "platform";
  requestedScope: "global" | "tenant" | "branch" | "branch_switch";
  tenantIntent?: {
    source: "path" | "slug" | "host" | "payload";
    rawValue: string;
  };
  branchIntent?: {
    source: "path" | "query" | "payload";
    rawValue: string;
  };
};

export type ActiveTenantAccessSnapshot = {
  tenantId: string;
  tenantRole?: "tenant_owner" | "branch_manager" | "receptionist" | "cashier";
  allowedBranchIds: string[];
};

export type ResolvedTenancyContext = {
  surface: "erp";
  scope: "tenant" | "branch";
  sessionId: string;
  subjectId: string;
  activeTenantId: string;
  activeBranchId: string | null;
  targetTenantId: string;
  targetBranchId: string | null;
  routeIntent: RawRouteIntent;
  access: ActiveTenantAccessSnapshot;
  branchSwitch: {
    requested: boolean;
    persisted: boolean;
    previousBranchId: string | null;
    nextBranchId: string | null;
  };
};

export type DatabaseAccessContext = {
  tenantId: string;
  branchId: string | null;
  subjectId: string;
  subjectType: "internal";
  sessionId: string;
};

export type TenancyErrorCode =
  | "unsupported_execution_surface"
  | "platform_tenant_execution_disabled"
  | "missing_active_tenant_context"
  | "missing_active_branch_context"
  | "tenant_intent_mismatch"
  | "branch_intent_mismatch"
  | "invalid_branch_switch_target"
  | "branch_not_in_active_tenant_scope"
  | "tenant_db_context_required";

export class TenancyError extends Error {
  readonly code: TenancyErrorCode;
}

export function resolveInternalTenancyContext(input: {
  routeIntent: RawRouteIntent;
  session: {
    sessionId: string;
    subjectId: string;
    subjectType: "internal";
    activeTenantId: string | null;
    activeBranchId: string | null;
  };
  access: ActiveTenantAccessSnapshot | null;
}): ResolvedTenancyContext;

export function toDatabaseAccessContext(
  context: ResolvedTenancyContext,
): DatabaseAccessContext;
```

This contract is intentionally narrow. It models trusted ERP execution context only.

## Resolved-Context Invariants

The following invariants are mandatory for every resolved ERP context in Phase 8:

1. tenant scope requires both `activeTenantId` and `targetTenantId`
2. branch scope requires a valid tenant context plus an explicit branch context
3. `targetTenantId` must equal `activeTenantId` in all Phase 8 ERP execution
4. `targetBranchId` may differ from `activeBranchId` only inside the dedicated branch-switch flow before persistence
5. a branch-switch request is valid only if the requested target branch is present in the active tenant-scoped access snapshot
6. resolved execution context must never exist for `surface: "platform"` in tenant, branch, or branch-switch scope during Phase 8

These invariants must be expressed in the resolver, not left to route-specific discipline.

## Explicit Platform Deny Rule

Platform tenant or branch execution is out of scope in Phase 8.

Until support-grant and controlled tenant-entry flows exist, the following must fail closed by default:

- `surface: "platform"` with `requestedScope: "tenant"`
- `surface: "platform"` with `requestedScope: "branch"`
- `surface: "platform"` with `requestedScope: "branch_switch"`

The failure must be explicit and machine-readable with `platform_tenant_execution_disabled`.

This prevents accidental creation of a cross-tenant bypass path before the platform support model exists.

## Internal ERP Resolution Rules

### Tenant-scoped ERP requests

Tenant-scoped ERP requests require:

- authenticated internal session
- `activeTenantId`
- trusted active-tenant access snapshot
- route tenant intent that either matches `activeTenantId` or is absent

Resolution result:

- `scope: "tenant"`
- `targetTenantId === activeTenantId`
- `targetBranchId === null`
- `branchSwitch.requested === false`

### Branch-scoped ERP requests

Branch-scoped ERP requests require:

- authenticated internal session
- `activeTenantId`
- `activeBranchId`
- trusted active-tenant access snapshot
- route branch intent that either matches `activeBranchId` or is absent

Resolution result:

- `scope: "branch"`
- `targetTenantId === activeTenantId`
- `targetBranchId === activeBranchId`
- `branchSwitch.requested === false`

### Branch-switch ERP requests

Dedicated branch-switch requests require:

- authenticated internal session
- `activeTenantId`
- trusted active-tenant access snapshot
- explicit requested branch target from raw route intent

Resolution result before persistence:

- `scope: "branch"`
- `targetTenantId === activeTenantId`
- `targetBranchId === requested branch target`
- `branchSwitch.requested === true`
- `branchSwitch.persisted === false`

If the requested branch equals the current branch, the request is an idempotent no-op:

- `branchSwitch.requested === true`
- `branchSwitch.persisted === false`
- handler may return success without changing the session or writing a new event

## Branch Switching Contract

Branch switching is a controlled session-context mutation, not a routing trick.

### Allowed actors

Phase 8 branch switching is limited to:

- authenticated internal ERP users
- with an active tenant context
- with a trusted tenant-scoped access snapshot

### Validation rules

A branch switch is valid only when:

- the route is a dedicated branch-switch action
- the request includes a non-empty branch target as raw intent
- the trusted access snapshot exists
- `access.tenantId === activeTenantId`
- `access.allowedBranchIds` includes the requested branch target

This is the strongest safe validation available before the real branch domain exists.

### Persistence point

Session persistence must happen only after:

1. tenancy validation succeeds
2. authz `switch_context` authorization succeeds

Persistence belongs in `packages/authn`, because the session is auth state.

### Audit requirement

Successful branch switches must emit a durable auth/account event. Phase 8 may add one infrastructure event type such as `branch_context_switched` for this purpose.

The event should record at least:

- `sessionId`
- `subjectId`
- `activeTenantId`
- previous branch ID
- next branch ID

### Failure behavior

On any invalid switch attempt:

- the request must fail closed
- the session must remain unchanged
- no partial branch update may be persisted

## DB Access Context Propagation

`packages/db` must remain thin in this phase. It may add infrastructure helpers only.

Recommended shape:

```ts
export async function withDatabaseAccessContext<TTx, TResult>(
  db: TransactionCapable<TTx>,
  context: DatabaseAccessContext,
  callback: (tx: TTx) => Promise<TResult>,
): Promise<TResult>;

export async function applyDatabaseAccessContext(
  tx: DatabaseContextCapable,
  context: DatabaseAccessContext,
): Promise<void>;
```

The DB helper must:

- require `tenantId` for tenant-scoped work
- apply trusted session-local or transaction-local values only
- use values derived from `ResolvedTenancyContext`

The DB helper must not:

- implement authorization policy
- infer tenant filters
- act as a repository abstraction
- silently continue if tenant DB context is missing

### DB context payload

Phase 8 should set transaction-local or connection-local values for later Phase 9 RLS use, such as:

- `vision.tenant_id`
- `vision.branch_id`
- `vision.subject_id`
- `vision.subject_type`
- `vision.session_id`

If tenant-scoped DB access is attempted without a trusted tenant context, the helper must fail with `tenant_db_context_required`.

## Error Model

Tenancy failures must be machine-readable and stable.

### Error codes

- `unsupported_execution_surface`
- `platform_tenant_execution_disabled`
- `missing_active_tenant_context`
- `missing_active_branch_context`
- `tenant_intent_mismatch`
- `branch_intent_mismatch`
- `invalid_branch_switch_target`
- `branch_not_in_active_tenant_scope`
- `tenant_db_context_required`

### Fail-closed matrix

| Condition | Layer | Error code |
| --- | --- | --- |
| non-ERP request attempts to resolve internal tenancy execution | tenancy | `unsupported_execution_surface` |
| platform request attempts tenant, branch, or branch-switch execution | tenancy | `platform_tenant_execution_disabled` |
| tenant-scoped ERP request has no `activeTenantId` | tenancy | `missing_active_tenant_context` |
| branch-scoped ERP request has no `activeBranchId` | tenancy | `missing_active_branch_context` |
| tenant raw intent conflicts with `activeTenantId` | tenancy | `tenant_intent_mismatch` |
| branch raw intent conflicts with `activeBranchId` outside switch flow | tenancy | `branch_intent_mismatch` |
| branch-switch request omits or malformed branch target | tenancy | `invalid_branch_switch_target` |
| branch-switch target is outside active tenant-scoped branch access | tenancy | `branch_not_in_active_tenant_scope` |
| tenant-scoped DB helper is called without tenant DB context | db | `tenant_db_context_required` |

The API layer must map these failures to stable `403` or `500` problem payloads without exposing internal debug metadata.

## Authorization Integration

Phase 8 does not replace Phase 7 authorization.

Instead, it makes the authz inputs trustworthy:

- authz should consume resolved tenant and branch facts from `ResolvedTenancyContext`
- route handlers must not mix direct session reads with route params to construct scope facts ad hoc
- routes that require tenancy must resolve tenancy before authz

This keeps the boundary clean:

- tenancy decides what the request is allowed to target
- authz decides whether the actor is allowed to perform the action in that resolved scope

## Testing Proof Required

Phase 8 is not complete unless tests prove all of the following.

### `packages/tenancy` unit tests

- internal ERP tenant scope resolves from matching session and raw route intent
- internal ERP branch scope resolves from matching session and raw route intent
- platform tenant or branch execution fails with `platform_tenant_execution_disabled`
- missing active tenant context fails with `missing_active_tenant_context`
- missing active branch context fails with `missing_active_branch_context`
- tenant intent mismatch fails with `tenant_intent_mismatch`
- branch intent mismatch fails with `branch_intent_mismatch`
- invalid branch-switch target fails with `invalid_branch_switch_target`
- target branch outside active tenant-scoped access fails with `branch_not_in_active_tenant_scope`
- same-branch switch resolves as idempotent no-op
- `toDatabaseAccessContext(...)` maps the resolved context correctly

### `packages/authn` integration tests

- active branch switch persists `auth_sessions.active_branch_id`
- active branch switch leaves `activeTenantId` unchanged
- successful switch writes the audit event
- tenant mismatch during persistence fails without mutating the session

### `packages/db` integration tests

- DB access helper sets transaction-local values
- transaction-local values are visible inside the transaction
- missing tenant DB context fails with `tenant_db_context_required`
- DB access context does not leak across transaction boundaries

### `apps/api` integration tests

- unauthenticated requests stop at `401` before tenancy
- tenancy resolution runs before authz
- tenancy failures map to precise machine-readable error codes
- routes using both tenancy and authz guards pass only when both layers succeed
- validated branch-switch flow persists the session branch only on success
- failed branch-switch flow does not mutate session state
- observability context can be enriched with resolved tenant and branch identifiers for tenant-scoped routes

## Documentation And ADR Updates Required

Phase 8 must update or add the following documentation:

- `docs/security/tenancy-execution-context.md`
- `docs/security/README.md`
- `docs/security/database-role-strategy.md`
- `docs/architecture/module-boundaries.md`
- `docs/adr/0005-transaction-local-tenancy-context.md`

The ADR should record the decision to propagate transaction-local DB access context from trusted tenancy resolution rather than rely on route-local filtering.

## Non-Goals

The following remain out of scope for Phase 8:

- tenant provisioning persistence
- branch persistence
- internal-user persistence
- support-grant workflows
- platform tenant-entry flows
- row-level security policy implementation
- public website tenant-resolution implementation
- broad repository abstractions
- hidden DB filtering logic

## Definition of Done

Phase 8 is done when:

- internal ERP requests resolve a trusted tenancy execution context before authz
- platform tenant and branch execution remain denied by default
- raw route intent stays separate from trusted state in code and tests
- the resolved-context invariants are encoded and tested
- branch switching is validated, predictable, and auditable
- `packages/db` applies only trusted DB access context and fails when it is missing
- the API layer maps tenancy failures to stable machine-readable problems
- no Phase 10 or Phase 11 business persistence has been pulled forward

Phase 8 is not done merely because the session stores `activeTenantId` and `activeBranchId`. It is complete only when tenant and branch scope become explicit, trusted, fail-closed runtime context across the API, application, and DB layers.
