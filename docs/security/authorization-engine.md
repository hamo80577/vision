# Authorization Engine

Phase 7 introduces the first real centralized authorization layer for Vision.

## Boundary

- `packages/authz` owns the authorization vocabulary, dispatcher, decision result, deny codes, and transport-agnostic `AuthzError`
- `apps/api` owns authenticated request resolution, minimal claim derivation, context fact normalization, and HTTP error translation
- `@vision/authz` may depend on `@vision/authn` for `AuthAssuranceLevel`
- `@vision/authn` must not depend on `@vision/authz`

Unauthenticated requests stop at `401` before authz. Authenticated denials become `AuthzError` and map to `403`.

## Phase 7 Minimal Authz Claims

Phase 7 uses normalized authz inputs, not the final durable org model:

- `platformRole`
- `tenantRole`
- `assignedBranchIds`

These claims are enough to centralize policy now without pulling Phase 10 or Phase 11 persistence forward.

## Actor And Context Model

Actor claims answer who is acting:

- `actorType`
- `subjectId`
- `currentAssurance`
- `platformRole?`
- `tenantRole?`
- `assignedBranchIds?`

Context facts answer what scope the request targets:

- `activeTenantId?`
- `activeBranchId?`
- `targetTenantId?`
- `targetBranchId?`
- `resourceOwnerSubjectId?`

Missing claims and missing context are different failure categories and must not be conflated.

## Supported Families

Phase 7 covers these resource families:

- `platform_tenant_management`
- `tenant_settings`
- `branch_operations`
- `website`
- `customer_account`

Customer support stays narrow and explicit:

- only `customer_account`
- only supported self-access actions
- no broad customer policy matrix

## Deny Codes

The engine freezes these machine-readable deny codes:

- `unsupported_actor`
- `unsupported_resource`
- `unsupported_action`
- `missing_context`
- `insufficient_scope`
- `insufficient_assurance`
- `self_access_only`
- `explicit_deny`

`debug` metadata may exist on denied decisions and `AuthzError` for logs, tests, and local inspection, but it is never part of the public denial payload by default.

## Assurance

Authorization reuses `AuthAssuranceLevel` from `@vision/authn`.

Initial Phase 7 assurance-sensitive actions:

- `platform_tenant_management.switch_context`
- `platform_tenant_management.export`
- `website.update`
- `website.export`

These actions require `step_up_verified`.

## Non-Goals

Phase 7 does not introduce:

- tenant provisioning persistence
- branch persistence
- internal-user persistence
- role-membership tables
- support-grant workflows
- broad public or customer permission coverage
