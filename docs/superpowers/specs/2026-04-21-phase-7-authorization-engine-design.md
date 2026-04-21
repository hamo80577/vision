# Phase 7 Authorization Engine Design

**Date:** 2026-04-21

**Goal**

Implement the Phase 7 centralized authorization engine required by the roadmap: a transport-agnostic decision layer in `packages/authz`, a thin adapter and guard layer in `apps/api`, explicit internal permission policies, assurance-aware decisions built on Phase 6 session state, and narrow explicit customer self-access that fails closed by default.

**Scope Boundary**

This slice builds the first real authorization layer for Vision. It does not pull forward tenant provisioning, branch modeling, internal user persistence, role-membership tables, or any temporary database structure that will later be replaced by Phases 10 and 11. Phase 7 owns authorization policy and policy inputs, not the final durable organizational model.

## Why This Slice Exists

The roadmap requires a centralized authorization engine before business modules start spreading route-local role checks across the codebase. The blueprint requires deny-by-default behavior, explicit action-resource decisions, centralized enforcement, and narrow customer self-access semantics. Phase 6 already introduced authenticated sessions, MFA, and assurance levels. Phase 7 must now turn authenticated identity into explicit authorization decisions without inventing persistence that belongs to later phases.

## Architecture

Phase 7 extends the current auth stack across two layers:

1. `packages/authz` owns the authorization vocabulary, policy evaluation, decision result, denial codes, and transport-agnostic `AuthzError`.
2. `apps/api` owns request-to-authz adaptation: read the authenticated subject from Phase 6 auth resolution, derive normalized claims and context facts, call the authz engine, and translate denied decisions into the frozen HTTP response shape.

This keeps authorization logic centralized and reusable while preserving the API layer as transport-only orchestration. No policy logic should live in route handlers beyond selecting the target resource family, action, and route facts.

## Package Boundary Rules

Phase 7 must preserve a strict authn/authz dependency direction:

- `@vision/authz` may import `AuthAssuranceLevel` from `@vision/authn`
- `@vision/authn` must not import or depend on `@vision/authz`
- there must be no authn/authz cycle

This keeps Phase 6 assurance state reusable by the authz engine without letting authentication and authorization collapse into one package.

## Auth Boundary

The API/authz boundary is frozen for this phase:

- unauthenticated or unresolved subjects never reach `authorize(...)`
- API returns `401` before authz when no valid authenticated subject exists
- authenticated subjects reach authz
- authenticated denials become `AuthzError` and map to `403`

The public API payload for authenticated denials is frozen to:

- `code`
- `requiredAssurance?`

No claims, policy internals, dispatcher names, or scope-debug details may leak into the public denial payload by default.

## Phase 7 Minimal Authz Claims

Phase 7 introduces minimal normalized authz claims as policy inputs. These are not the final durable organizational model.

They exist only to let the engine make centralized decisions now:

- `platformRole` means a platform-scoped authorization claim
- `tenantRole` means a role claim in the active tenant context
- `assignedBranchIds` means branch scope within the active tenant context

These fields must be treated as Phase 7 minimal authz claims only. Real tenant provisioning, branch assignment, and internal-user role persistence still belong to Phases 10 and 11.

## Claims and Context Separation

Phase 7 must keep actor claims separate from runtime context facts.

### Actor claims

Actor claims answer who is acting:

- `actorType`
- `subjectId`
- `currentAssurance`
- `platformRole?`
- `tenantRole?`
- `assignedBranchIds?`

### Context facts

Context facts answer what scope and target the action applies to:

- `activeTenantId?`
- `activeBranchId?`
- `targetTenantId?`
- `targetBranchId?`
- `resourceOwnerSubjectId?`

Active tenant and branch must not be hidden inside actor claims. They are runtime context facts that change with the current request.

## Type Contract

Phase 7 should expose a small explicit TypeScript contract in `packages/authz`.

```ts
import type { AuthAssuranceLevel } from "@vision/authn";

export type InternalPlatformRole = "platform_admin";

export type InternalTenantRole =
  | "tenant_owner"
  | "branch_manager"
  | "receptionist"
  | "cashier";

export type AuthorizationActorClaims =
  | {
      actorType: "internal";
      subjectId: string;
      currentAssurance: AuthAssuranceLevel;
      platformRole?: InternalPlatformRole;
      tenantRole?: InternalTenantRole;
      assignedBranchIds?: string[];
    }
  | {
      actorType: "customer";
      subjectId: string;
      currentAssurance: AuthAssuranceLevel;
    };

export type AuthorizationResource =
  | { family: "platform_tenant_management" }
  | { family: "tenant_settings" }
  | { family: "branch_operations" }
  | { family: "website" }
  | { family: "customer_account" };

export type AuthorizationAction =
  | "read"
  | "list"
  | "create"
  | "update"
  | "delete"
  | "change_status"
  | "switch_context"
  | "export";

export type AuthorizationContextFacts = {
  activeTenantId?: string;
  activeBranchId?: string;
  targetTenantId?: string;
  targetBranchId?: string;
  resourceOwnerSubjectId?: string;
};

export type AuthorizationDeniedCode =
  | "unsupported_actor"
  | "unsupported_resource"
  | "unsupported_action"
  | "missing_context"
  | "insufficient_scope"
  | "insufficient_assurance"
  | "self_access_only"
  | "explicit_deny";

export type AuthorizationDecision =
  | { allowed: true }
  | {
      allowed: false;
      code: AuthorizationDeniedCode;
      requiredAssurance?: AuthAssuranceLevel;
      debug?: AuthorizationDecisionDebug;
    };

export type AuthorizationDecisionDebug = {
  policyFamily?: string;
  missingFacts?: string[];
  expectedTenantId?: string;
  expectedBranchId?: string;
};

export type AuthorizationInput = {
  actor: AuthorizationActorClaims;
  resource: AuthorizationResource;
  action: AuthorizationAction;
  context: AuthorizationContextFacts;
};

export class AuthzError extends Error {
  readonly code: AuthorizationDeniedCode;
  readonly requiredAssurance?: AuthAssuranceLevel;
  readonly debug?: AuthorizationDecisionDebug;
}

export function authorize(input: AuthorizationInput): AuthorizationDecision;

export function requireAuthorization(
  decision: AuthorizationDecision,
): asserts decision is { allowed: true };
```

`debug` metadata is internal-only. It is safe for logs, tests, and local inspection, but it must never become part of the public API denial payload by default.

## Deny Model

Phase 7 freezes the authorization denial codes:

- `unsupported_actor`
- `unsupported_resource`
- `unsupported_action`
- `missing_context`
- `insufficient_scope`
- `insufficient_assurance`
- `self_access_only`
- `explicit_deny`

These codes must be stable, machine-readable, and reused consistently across package tests and API integration tests.

### Missing claims versus missing context

Missing claims and missing context are different failure categories and must not be conflated:

- missing required route or target facts uses `missing_context`
- missing `platformRole`, `tenantRole`, or `assignedBranchIds` does not use `missing_context`
- missing claim data uses `insufficient_scope` when the actor type is supported but lacks scope information
- missing claim data uses `unsupported_actor` only when the actor type itself is not valid for the policy family

The implementation must not improvise this distinction route by route.

## Policy Shape

Policy evaluation in Phase 7 must remain explicit code with a single dispatcher and resource-family policy functions.

Required structure:

- one dispatcher that routes by `resource.family`
- one focused policy function per resource family
- explicit checks for actor type, action, required context facts, scope, and assurance
- deny-by-default for every unsupported or underspecified combination

Phase 7 must not use:

- stringly role matrices
- ad hoc `if role === ...` checks scattered across routes
- policy rules encoded in route-local conditionals
- persistence assumptions from future phases

## Supported Resource Families and Actions

Phase 7 should ship a small but real policy surface.

| Resource family | Supported actions in Phase 7 | Notes |
| --- | --- | --- |
| `platform_tenant_management` | `read`, `list`, `update`, `change_status`, `switch_context`, `export` | Platform-scoped internal operations only. |
| `tenant_settings` | `read`, `update` | Tenant-wide internal settings access. |
| `branch_operations` | `read`, `list`, `create`, `update`, `change_status`, `switch_context` | Phase 7 umbrella for branch-scoped internal operations, not a permanent broad permission bucket. |
| `website` | `read`, `update`, `export` | Website authority is an initial Phase 7 rule only. |
| `customer_account` | `read`, `update` | Narrow explicit customer self-access only. |

Anything outside this supported matrix must deny closed with `unsupported_resource` or `unsupported_action`.

## Required Facts and Initial Allow Rules

| Resource family | Required facts | Initial Phase 7 allow rule | Deny behavior |
| --- | --- | --- | --- |
| `platform_tenant_management` | `targetTenantId` for every action except pure `list` | `internal` actor with `platformRole: "platform_admin"` | Missing tenant fact => `missing_context`. Missing `platformRole` => `insufficient_scope`. `switch_context` and `export` require `step_up_verified`, otherwise `insufficient_assurance`. |
| `tenant_settings` | `activeTenantId`, `targetTenantId` | `internal` actor with `tenantRole: "tenant_owner"` and `activeTenantId === targetTenantId` | Missing tenant fact => `missing_context`. Missing `tenantRole` => `insufficient_scope`. Tenant mismatch => `insufficient_scope`. |
| `branch_operations` | `activeTenantId`, `targetTenantId`, `targetBranchId`; `activeBranchId` for all actions except `switch_context` | `internal` actor with branch-scoped authority in the active tenant and target branch inside `assignedBranchIds` | Missing tenant or branch facts => `missing_context`. Missing `assignedBranchIds` for branch-scoped actions => `insufficient_scope`. Tenant mismatch => `insufficient_scope`. Target branch outside scope => `insufficient_scope`. |
| `website` | `activeTenantId`, `targetTenantId` | initial Phase 7 allow rule is `tenantRole: "tenant_owner"` with matching tenant scope | Missing tenant fact => `missing_context`. Missing `tenantRole` => `insufficient_scope`. `update` and `export` require `step_up_verified`, otherwise `insufficient_assurance`. Later expansion must happen through new policy claims or families, not silent mutation of this rule. |
| `customer_account` | `resourceOwnerSubjectId` | `customer` actor only, with `subjectId === resourceOwnerSubjectId` | Missing owner fact => `missing_context`. Non-self access => `self_access_only`. All unsupported customer actions => `unsupported_action`. Internal actors do not receive implicit access here in Phase 7. |

## Internal-First Scope

Internal authorization is the primary concern of this phase.

Phase 7 must provide real internal policy coverage for:

- platform tenant management
- tenant-wide settings
- branch-scoped operations
- website reads and writes
- assurance-aware sensitive internal actions

The engine must still model `customer` as a first-class actor type, but customer behavior remains intentionally narrow and explicit.

## Customer Self-Access Rule

Customer support in Phase 7 is limited to narrow explicit self-access. The engine must not imply a broad customer permission matrix.

Allowed shape:

- actor type is `customer`
- resource family is `customer_account`
- action is explicitly supported
- `resourceOwnerSubjectId` exists
- `subjectId === resourceOwnerSubjectId`

Everything else denies closed.

## Assurance-Aware Authorization

Authorization policy should decide when elevated assurance is required. Callers must not pass generic `requiredAssurance` as an input knob.

The engine receives current session assurance through actor claims and evaluates assurance inside policy functions. If a policy requires stronger assurance, the denial result includes:

- `code: "insufficient_assurance"`
- `requiredAssurance`

Initial Phase 7 assurance-sensitive actions:

- `platform_tenant_management.switch_context` requires `step_up_verified`
- `platform_tenant_management.export` requires `step_up_verified`
- `website.update` requires `step_up_verified`
- `website.export` requires `step_up_verified`

Later phases may add more assurance-sensitive actions, but only through explicit policy expansion.

## API Adapter and Guard Layer

`apps/api` owns the thin adaptation layer around the authz engine.

Responsibilities:

- read the authenticated subject from Phase 6 auth resolution
- derive Phase 7 minimal authz claims from the authenticated subject and route-specific caller state
- normalize request-specific context facts
- call `authorize(...)`
- call `requireAuthorization(...)`
- translate `AuthzError` into the frozen `403` API payload

The API layer must not:

- own authorization policy logic
- invent new deny codes
- expose `debug` metadata publicly
- bypass the centralized dispatcher for convenience

## Missing or Unsupported Input Behavior

Phase 7 must fail closed for all ambiguous or incomplete input.

Rules:

- unsupported actor type for a family => `unsupported_actor`
- unsupported resource family => `unsupported_resource`
- unsupported action for a supported family => `unsupported_action`
- absent required tenant, branch, or owner facts => `missing_context`
- supported actor without enough claims or branch scope => `insufficient_scope`
- supported self-access family with non-self target => `self_access_only`
- explicit policy rule says never allow => `explicit_deny`

No policy may silently fall back to broader access because a claim or context fact is absent.

## Test Proof Required for This Slice

Phase 7 is not complete unless tests prove all of the following.

### Package unit tests

- unknown actor, resource, and action combinations deny by default
- unsupported resource/action pairs return stable deny codes
- missing tenant facts return `missing_context`
- missing branch facts return `missing_context`
- `activeTenantId !== targetTenantId` returns `insufficient_scope`
- target branch outside `assignedBranchIds` returns `insufficient_scope`
- missing `platformRole`, `tenantRole`, or `assignedBranchIds` follows the frozen missing-claim rules
- `platform_tenant_management.switch_context` denies without `step_up_verified`
- `platform_tenant_management.export` denies without `step_up_verified`
- `website.update` denies without `step_up_verified`
- `website.export` denies without `step_up_verified`
- customer self-access allows only supported self actions
- customer non-self access returns `self_access_only`
- unsupported customer actions return `unsupported_action`

### API integration tests

- unauthenticated requests stop at `401` before authz
- authenticated denials map to `403`
- authenticated denial payload contains only `code` and `requiredAssurance?`
- internal debug metadata does not leak through the HTTP payload
- guard integration correctly derives claims and required context facts for the resource family under test

## Non-Goals

The following are explicitly out of scope for Phase 7:

- tenant provisioning persistence
- branch persistence
- internal-user persistence
- role-membership tables
- durable tenant or branch assignment schema
- platform support grant workflows
- Phase 8 tenancy execution context
- Phase 9 database RLS enforcement
- broad customer or public permission coverage
- fake temporary database structures that will be replaced by Phases 10 or 11

## Documentation Requirement

This phase must be documented as:

- a centralized internal authorization engine
- with narrow explicit customer self-access
- using Phase 7 minimal authz claims rather than the final durable org model
- preserving the no-cycle dependency between authn and authz

If implementation expands the supported resource families, actions, or deny codes, the docs must be updated in the same change.

## Definition of Done for This Slice

This Phase 7 slice is done when:

- `packages/authz` contains the centralized vocabulary, dispatcher, policy families, decision model, and transport-agnostic `AuthzError`
- `apps/api` contains only the thin authz adapter and error translation layer
- the authn/authz dependency direction remains acyclic
- deny codes are frozen and reused consistently
- 401 versus 403 ownership is explicit and enforced
- missing claims versus missing context behavior is explicit and tested
- required facts per resource family are implemented and documented
- the supported resource family/action surface is implemented and documented
- assurance-aware denials include `requiredAssurance` where policy requires it
- fail-closed package and API tests pass
- no Phase 10 or Phase 11 persistence has been pulled into this phase

Phase 7 is not complete merely because a guard helper exists. It is complete only when authorization decisions are centralized, explicit, deny by default, assurance-aware where required, and verified by tests.
