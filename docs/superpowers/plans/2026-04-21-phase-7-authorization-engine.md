# Phase 7 Authorization Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 7 centralized authorization engine in `packages/authz`, add a reusable API guard in `apps/api`, preserve the frozen 401 versus 403 boundary, and verify narrow explicit customer self-access and deny-by-default behavior.

**Architecture:** Keep the authorization vocabulary, dispatcher, denial model, and transport-agnostic `AuthzError` in `packages/authz`. Keep `apps/api` thin by adapting authenticated request state into authz claims and context facts, then translating `AuthzError` into the HTTP problem payload without leaking internal debug metadata. Reuse Phase 6 assurance levels from `@vision/authn`, but do not pull Phase 10 or Phase 11 persistence forward.

**Tech Stack:** TypeScript, Fastify, Vitest, PostgreSQL, Drizzle ORM, existing `@vision/authn` and `@vision/observability`

---

## File Structure

### Create

- `packages/authz/src/types.ts`
- `packages/authz/src/errors.ts`
- `packages/authz/src/errors.test.ts`
- `packages/authz/src/authorize.ts`
- `packages/authz/src/authorize.test.ts`
- `apps/api/src/auth-request.ts`
- `apps/api/src/authz-guard.ts`
- `apps/api/src/authz-guard.test.ts`
- `docs/security/authorization-engine.md`

### Modify

- `packages/authz/package.json`
- `packages/authz/src/index.ts`
- `packages/observability/src/problem-details.ts`
- `packages/observability/src/problem-details.test.ts`
- `packages/observability/src/errors.ts`
- `packages/observability/src/errors.test.ts`
- `apps/api/package.json`
- `apps/api/src/auth-plugin.ts`
- `apps/api/src/http-errors.ts`
- `docs/security/README.md`
- `pnpm-lock.yaml`

### Responsibilities

- `packages/authz/src/types.ts`: Phase 7 authz claims, context facts, resource families, actions, deny codes, debug metadata, and decision types.
- `packages/authz/src/errors.ts`: `AuthzError`, `isAuthzError`, and `requireAuthorization`.
- `packages/authz/src/authorize.ts`: single dispatcher plus explicit resource-family policy functions for `platform_tenant_management`, `tenant_settings`, `branch_operations`, `website`, and `customer_account`.
- `apps/api/src/auth-request.ts`: shared `401` helper that stops unauthenticated requests before authz.
- `apps/api/src/authz-guard.ts`: reusable route guard that derives authz input from authenticated request state and throws `AuthzError` on authenticated denials.
- `packages/observability/src/problem-details.ts`: extend problem `code` support for authz deny codes while keeping public authz denial metadata frozen to `code` and `requiredAssurance?`.
- `packages/observability/src/errors.ts`: keep logs safe while allowing internal-only authz `debug` metadata to appear in logs and tests, not public API responses.
- `apps/api/src/http-errors.ts`: translate `AuthzError` into stable `403` problem responses without leaking `debug` or Phase 6 `denialReason`.
- `apps/api/src/authz-guard.test.ts`: prove `401` before authz, `403` after authz, missing-context denial, assurance-aware denial, and explicit customer self-access against real API routes.
- `docs/security/authorization-engine.md`: living Phase 7 security note describing the engine boundary, deny codes, minimal claims, and non-goals.

### Task 1: Add the Phase 7 Authz Contract and Error Primitives

**Files:**
- Create: `packages/authz/src/types.ts`
- Create: `packages/authz/src/errors.ts`
- Create: `packages/authz/src/errors.test.ts`
- Modify: `packages/authz/package.json`
- Modify: `packages/authz/src/index.ts`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Write the failing authz-error test**

Create `packages/authz/src/errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  AuthzError,
  isAuthzError,
  requireAuthorization,
  type AuthorizationDecision,
} from "./index";

describe("authz errors", () => {
  it("throws AuthzError with code, assurance, and debug metadata from denied decisions", () => {
    const denied: AuthorizationDecision = {
      allowed: false,
      code: "insufficient_assurance",
      requiredAssurance: "step_up_verified",
      debug: {
        policyFamily: "website",
        missingFacts: ["targetTenantId"],
      },
    };

    expect(() => requireAuthorization(denied)).toThrow(AuthzError);

    try {
      requireAuthorization(denied);
    } catch (error) {
      expect(isAuthzError(error)).toBe(true);
      expect(error).toMatchObject({
        code: "insufficient_assurance",
        requiredAssurance: "step_up_verified",
        debug: {
          policyFamily: "website",
          missingFacts: ["targetTenantId"],
        },
      });
    }
  });

  it("accepts allowed decisions without throwing", () => {
    expect(() => requireAuthorization({ allowed: true })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the authz-error test to verify it fails**

Run:

```powershell
pnpm --filter @vision/authz test -- src/errors.test.ts
```

Expected: FAIL because `AuthorizationDecision`, `AuthzError`, `isAuthzError`, and `requireAuthorization` do not exist yet.

- [ ] **Step 3: Add the authz package contract and error primitives**

Update `packages/authz/package.json`:

```json
{
  "name": "@vision/authz",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts --out-dir dist",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run --passWithNoTests"
  },
  "dependencies": {
    "@vision/authn": "workspace:*"
  }
}
```

Create `packages/authz/src/types.ts`:

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

export type AuthorizationDecisionDebug = {
  policyFamily?: string;
  missingFacts?: string[];
  expectedTenantId?: string;
  expectedBranchId?: string;
};

export type AuthorizationDecision =
  | { allowed: true }
  | {
      allowed: false;
      code: AuthorizationDeniedCode;
      requiredAssurance?: AuthAssuranceLevel;
      debug?: AuthorizationDecisionDebug;
    };

export type AuthorizationInput = {
  actor: AuthorizationActorClaims;
  resource: AuthorizationResource;
  action: AuthorizationAction;
  context: AuthorizationContextFacts;
};
```

Create `packages/authz/src/errors.ts`:

```ts
import type { AuthAssuranceLevel } from "@vision/authn";

import type {
  AuthorizationDecision,
  AuthorizationDecisionDebug,
  AuthorizationDeniedCode,
} from "./types";

const AUTHZ_ERROR_NAME = "AuthzError";

const AUTHZ_ERROR_MESSAGES: Record<AuthorizationDeniedCode, string> = {
  unsupported_actor: "Actor type is not supported for this resource.",
  unsupported_resource: "Resource family is not supported.",
  unsupported_action: "Action is not supported for this resource.",
  missing_context: "Required authorization context is missing.",
  insufficient_scope: "Actor scope does not permit this action.",
  insufficient_assurance: "Higher assurance is required for this action.",
  self_access_only: "This resource only permits explicit self-access.",
  explicit_deny: "This action is explicitly denied by policy.",
};

export type AuthzErrorOptions = {
  requiredAssurance?: AuthAssuranceLevel;
  debug?: AuthorizationDecisionDebug;
};

export class AuthzError extends Error {
  readonly code: AuthorizationDeniedCode;
  readonly requiredAssurance?: AuthAssuranceLevel;
  readonly debug?: AuthorizationDecisionDebug;

  constructor(code: AuthorizationDeniedCode, options: AuthzErrorOptions = {}) {
    super(AUTHZ_ERROR_MESSAGES[code]);
    this.name = AUTHZ_ERROR_NAME;
    this.code = code;
    this.requiredAssurance = options.requiredAssurance;
    this.debug = options.debug;
  }
}

export function isAuthzError(value: unknown): value is AuthzError {
  return value instanceof AuthzError;
}

export function requireAuthorization(
  decision: AuthorizationDecision,
): asserts decision is { allowed: true } {
  if (decision.allowed) {
    return;
  }

  throw new AuthzError(decision.code, {
    requiredAssurance: decision.requiredAssurance,
    debug: decision.debug,
  });
}
```

Update `packages/authz/src/index.ts`:

```ts
export const authzPackageName = "@vision/authz" as const;

export {
  AuthzError,
  isAuthzError,
  requireAuthorization,
  type AuthzErrorOptions,
} from "./errors";
export type {
  AuthorizationAction,
  AuthorizationActorClaims,
  AuthorizationContextFacts,
  AuthorizationDecision,
  AuthorizationDecisionDebug,
  AuthorizationDeniedCode,
  AuthorizationInput,
  AuthorizationResource,
  InternalPlatformRole,
  InternalTenantRole,
} from "./types";
```

Refresh the lockfile:

```powershell
pnpm install
```

- [ ] **Step 4: Run the authz-error test to verify it passes**

Run:

```powershell
pnpm --filter @vision/authz test -- src/errors.test.ts
```

Expected: PASS with `2 passed`.

- [ ] **Step 5: Commit**

```powershell
git add packages/authz/package.json packages/authz/src/types.ts packages/authz/src/errors.ts packages/authz/src/errors.test.ts packages/authz/src/index.ts pnpm-lock.yaml
git commit -m "feat: add authz contract and error primitives"
```

### Task 2: Implement the Authorization Dispatcher and Resource Policies

**Files:**
- Create: `packages/authz/src/authorize.ts`
- Create: `packages/authz/src/authorize.test.ts`
- Modify: `packages/authz/src/index.ts`

- [ ] **Step 1: Write the failing authorization-policy test**

Create `packages/authz/src/authorize.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { authorize } from "./index";
import type {
  AuthorizationActorClaims,
  AuthorizationInput,
} from "./types";

const baseInternalActor: AuthorizationActorClaims = {
  actorType: "internal",
  subjectId: "sub_internal",
  currentAssurance: "mfa_verified",
};

const baseCustomerActor: AuthorizationActorClaims = {
  actorType: "customer",
  subjectId: "sub_customer",
  currentAssurance: "basic",
};

function runAuthorization(
  input: Partial<AuthorizationInput> &
    Pick<AuthorizationInput, "resource" | "action">,
) {
  return authorize({
    actor: baseInternalActor,
    context: {},
    ...input,
  });
}

describe("authorize", () => {
  it("denies unsupported resource families by default", () => {
    const decision = authorize({
      actor: baseInternalActor,
      action: "read",
      resource: { family: "unknown_family" } as AuthorizationInput["resource"],
      context: {},
    });

    expect(decision).toMatchObject({
      allowed: false,
      code: "unsupported_resource",
    });
  });

  it("returns missing_context when tenant facts are absent", () => {
    const decision = runAuthorization({
      resource: { family: "tenant_settings" },
      action: "read",
      actor: {
        ...baseInternalActor,
        tenantRole: "tenant_owner",
      },
      context: {},
    });

    expect(decision).toMatchObject({
      allowed: false,
      code: "missing_context",
    });
  });

  it("returns insufficient_scope when tenant facts do not match", () => {
    const decision = runAuthorization({
      resource: { family: "tenant_settings" },
      action: "read",
      actor: {
        ...baseInternalActor,
        tenantRole: "tenant_owner",
      },
      context: {
        activeTenantId: "tenant_a",
        targetTenantId: "tenant_b",
      },
    });

    expect(decision).toMatchObject({
      allowed: false,
      code: "insufficient_scope",
    });
  });

  it("returns missing_context when branch facts are absent", () => {
    const decision = runAuthorization({
      resource: { family: "branch_operations" },
      action: "read",
      actor: {
        ...baseInternalActor,
        tenantRole: "branch_manager",
        assignedBranchIds: ["branch_1"],
      },
      context: {
        activeTenantId: "tenant_1",
        targetTenantId: "tenant_1",
      },
    });

    expect(decision).toMatchObject({
      allowed: false,
      code: "missing_context",
    });
  });

  it("returns insufficient_scope when the target branch is outside assigned scope", () => {
    const decision = runAuthorization({
      resource: { family: "branch_operations" },
      action: "update",
      actor: {
        ...baseInternalActor,
        tenantRole: "branch_manager",
        assignedBranchIds: ["branch_1"],
      },
      context: {
        activeTenantId: "tenant_1",
        activeBranchId: "branch_2",
        targetTenantId: "tenant_1",
        targetBranchId: "branch_2",
      },
    });

    expect(decision).toMatchObject({
      allowed: false,
      code: "insufficient_scope",
    });
  });

  it("returns insufficient_assurance for under-assured switch-context actions", () => {
    const decision = runAuthorization({
      resource: { family: "platform_tenant_management" },
      action: "switch_context",
      actor: {
        ...baseInternalActor,
        currentAssurance: "mfa_verified",
        platformRole: "platform_admin",
      },
      context: {
        targetTenantId: "tenant_1",
      },
    });

    expect(decision).toMatchObject({
      allowed: false,
      code: "insufficient_assurance",
      requiredAssurance: "step_up_verified",
    });
  });

  it("allows explicit customer self-access", () => {
    const decision = authorize({
      actor: baseCustomerActor,
      resource: { family: "customer_account" },
      action: "read",
      context: {
        resourceOwnerSubjectId: "sub_customer",
      },
    });

    expect(decision).toEqual({ allowed: true });
  });

  it("denies non-self customer access", () => {
    const decision = authorize({
      actor: baseCustomerActor,
      resource: { family: "customer_account" },
      action: "read",
      context: {
        resourceOwnerSubjectId: "someone_else",
      },
    });

    expect(decision).toMatchObject({
      allowed: false,
      code: "self_access_only",
    });
  });

  it("denies unsupported customer actions", () => {
    const decision = authorize({
      actor: baseCustomerActor,
      resource: { family: "customer_account" },
      action: "delete",
      context: {
        resourceOwnerSubjectId: "sub_customer",
      },
    });

    expect(decision).toMatchObject({
      allowed: false,
      code: "unsupported_action",
    });
  });
});
```

- [ ] **Step 2: Run the authorization-policy test to verify it fails**

Run:

```powershell
pnpm --filter @vision/authz test -- src/authorize.test.ts
```

Expected: FAIL because `authorize` does not exist yet.

- [ ] **Step 3: Add the dispatcher and Phase 7 resource-family policies**

Create `packages/authz/src/authorize.ts`:

```ts
import type { AuthAssuranceLevel } from "@vision/authn";

import type {
  AuthorizationAction,
  AuthorizationDecision,
  AuthorizationDecisionDebug,
  AuthorizationDeniedCode,
  AuthorizationInput,
  AuthorizationResource,
  InternalTenantRole,
} from "./types";

const ASSURANCE_RANK: Record<AuthAssuranceLevel, number> = {
  basic: 0,
  mfa_verified: 1,
  step_up_verified: 2,
};

const BRANCH_SCOPED_ROLES: InternalTenantRole[] = [
  "branch_manager",
  "receptionist",
  "cashier",
];

function allow(): AuthorizationDecision {
  return { allowed: true };
}

function deny(
  code: AuthorizationDeniedCode,
  options: {
    requiredAssurance?: AuthAssuranceLevel;
    debug?: AuthorizationDecisionDebug;
  } = {},
): AuthorizationDecision {
  return {
    allowed: false,
    code,
    ...(options.requiredAssurance
      ? { requiredAssurance: options.requiredAssurance }
      : {}),
    ...(options.debug ? { debug: options.debug } : {}),
  };
}

function hasRequiredAssurance(
  currentAssurance: AuthAssuranceLevel,
  requiredAssurance: AuthAssuranceLevel,
) {
  return ASSURANCE_RANK[currentAssurance] >= ASSURANCE_RANK[requiredAssurance];
}

function findMissingFacts(
  context: AuthorizationInput["context"],
  factNames: (keyof AuthorizationInput["context"])[],
) {
  return factNames.filter((factName) => {
    const value = context[factName];
    return typeof value !== "string" || value.length === 0;
  });
}

function denyMissingContext(
  policyFamily: AuthorizationResource["family"] | string,
  context: AuthorizationInput["context"],
  factNames: (keyof AuthorizationInput["context"])[],
) {
  const missingFacts = findMissingFacts(context, factNames);

  if (missingFacts.length === 0) {
    return null;
  }

  return deny("missing_context", {
    debug: {
      policyFamily,
      missingFacts: missingFacts.map(String),
    },
  });
}

function denyUnsupportedActor(policyFamily: AuthorizationResource["family"] | string) {
  return deny("unsupported_actor", {
    debug: {
      policyFamily,
    },
  });
}

function denyUnsupportedAction(policyFamily: AuthorizationResource["family"] | string) {
  return deny("unsupported_action", {
    debug: {
      policyFamily,
    },
  });
}

function denyInsufficientScope(
  policyFamily: AuthorizationResource["family"] | string,
  debug: AuthorizationDecisionDebug = {},
) {
  return deny("insufficient_scope", {
    debug: {
      policyFamily,
      ...debug,
    },
  });
}

function denyInsufficientAssurance(
  policyFamily: AuthorizationResource["family"] | string,
  requiredAssurance: AuthAssuranceLevel,
) {
  return deny("insufficient_assurance", {
    requiredAssurance,
    debug: {
      policyFamily,
    },
  });
}

function authorizePlatformTenantManagement(
  input: AuthorizationInput,
): AuthorizationDecision {
  const policyFamily = "platform_tenant_management" as const;

  if (input.actor.actorType !== "internal") {
    return denyUnsupportedActor(policyFamily);
  }

  const supportedActions: AuthorizationAction[] = [
    "read",
    "list",
    "update",
    "change_status",
    "switch_context",
    "export",
  ];
  if (!supportedActions.includes(input.action)) {
    return denyUnsupportedAction(policyFamily);
  }

  if (input.action !== "list") {
    const missingContext = denyMissingContext(policyFamily, input.context, [
      "targetTenantId",
    ]);
    if (missingContext) {
      return missingContext;
    }
  }

  if (input.actor.platformRole !== "platform_admin") {
    return denyInsufficientScope(policyFamily);
  }

  if (
    (input.action === "switch_context" || input.action === "export") &&
    !hasRequiredAssurance(input.actor.currentAssurance, "step_up_verified")
  ) {
    return denyInsufficientAssurance(policyFamily, "step_up_verified");
  }

  return allow();
}

function authorizeTenantSettings(input: AuthorizationInput): AuthorizationDecision {
  const policyFamily = "tenant_settings" as const;

  if (input.actor.actorType !== "internal") {
    return denyUnsupportedActor(policyFamily);
  }

  const supportedActions: AuthorizationAction[] = ["read", "update"];
  if (!supportedActions.includes(input.action)) {
    return denyUnsupportedAction(policyFamily);
  }

  const missingContext = denyMissingContext(policyFamily, input.context, [
    "activeTenantId",
    "targetTenantId",
  ]);
  if (missingContext) {
    return missingContext;
  }

  if (input.actor.tenantRole !== "tenant_owner") {
    return denyInsufficientScope(policyFamily);
  }

  if (input.context.activeTenantId !== input.context.targetTenantId) {
    return denyInsufficientScope(policyFamily, {
      expectedTenantId: input.context.targetTenantId,
    });
  }

  return allow();
}

function authorizeBranchOperations(input: AuthorizationInput): AuthorizationDecision {
  const policyFamily = "branch_operations" as const;

  if (input.actor.actorType !== "internal") {
    return denyUnsupportedActor(policyFamily);
  }

  const supportedActions: AuthorizationAction[] = [
    "read",
    "list",
    "create",
    "update",
    "change_status",
    "switch_context",
  ];
  if (!supportedActions.includes(input.action)) {
    return denyUnsupportedAction(policyFamily);
  }

  const missingContext = denyMissingContext(
    policyFamily,
    input.context,
    input.action === "switch_context"
      ? ["activeTenantId", "targetTenantId", "targetBranchId"]
      : ["activeTenantId", "activeBranchId", "targetTenantId", "targetBranchId"],
  );
  if (missingContext) {
    return missingContext;
  }

  if (input.context.activeTenantId !== input.context.targetTenantId) {
    return denyInsufficientScope(policyFamily, {
      expectedTenantId: input.context.targetTenantId,
    });
  }

  if (input.actor.tenantRole === "tenant_owner") {
    if (
      input.action !== "switch_context" &&
      input.context.activeBranchId !== input.context.targetBranchId
    ) {
      return denyInsufficientScope(policyFamily, {
        expectedBranchId: input.context.targetBranchId,
      });
    }

    return allow();
  }

  if (
    input.actor.tenantRole === undefined ||
    !BRANCH_SCOPED_ROLES.includes(input.actor.tenantRole)
  ) {
    return denyInsufficientScope(policyFamily);
  }

  if (
    input.actor.assignedBranchIds === undefined ||
    input.actor.assignedBranchIds.length === 0
  ) {
    return denyInsufficientScope(policyFamily);
  }

  if (!input.actor.assignedBranchIds.includes(input.context.targetBranchId as string)) {
    return denyInsufficientScope(policyFamily, {
      expectedBranchId: input.context.targetBranchId,
    });
  }

  if (
    input.action !== "switch_context" &&
    input.context.activeBranchId !== input.context.targetBranchId
  ) {
    return denyInsufficientScope(policyFamily, {
      expectedBranchId: input.context.targetBranchId,
    });
  }

  return allow();
}

function authorizeWebsite(input: AuthorizationInput): AuthorizationDecision {
  const policyFamily = "website" as const;

  if (input.actor.actorType !== "internal") {
    return denyUnsupportedActor(policyFamily);
  }

  const supportedActions: AuthorizationAction[] = ["read", "update", "export"];
  if (!supportedActions.includes(input.action)) {
    return denyUnsupportedAction(policyFamily);
  }

  const missingContext = denyMissingContext(policyFamily, input.context, [
    "activeTenantId",
    "targetTenantId",
  ]);
  if (missingContext) {
    return missingContext;
  }

  if (input.actor.tenantRole !== "tenant_owner") {
    return denyInsufficientScope(policyFamily);
  }

  if (input.context.activeTenantId !== input.context.targetTenantId) {
    return denyInsufficientScope(policyFamily, {
      expectedTenantId: input.context.targetTenantId,
    });
  }

  if (
    (input.action === "update" || input.action === "export") &&
    !hasRequiredAssurance(input.actor.currentAssurance, "step_up_verified")
  ) {
    return denyInsufficientAssurance(policyFamily, "step_up_verified");
  }

  return allow();
}

function authorizeCustomerAccount(input: AuthorizationInput): AuthorizationDecision {
  const policyFamily = "customer_account" as const;

  if (input.actor.actorType !== "customer") {
    return denyUnsupportedActor(policyFamily);
  }

  const supportedActions: AuthorizationAction[] = ["read", "update"];
  if (!supportedActions.includes(input.action)) {
    return denyUnsupportedAction(policyFamily);
  }

  const missingContext = denyMissingContext(policyFamily, input.context, [
    "resourceOwnerSubjectId",
  ]);
  if (missingContext) {
    return missingContext;
  }

  if (input.actor.subjectId !== input.context.resourceOwnerSubjectId) {
    return deny("self_access_only", {
      debug: {
        policyFamily,
      },
    });
  }

  return allow();
}

export function authorize(input: AuthorizationInput): AuthorizationDecision {
  switch ((input.resource as { family?: string }).family) {
    case "platform_tenant_management":
      return authorizePlatformTenantManagement(input);
    case "tenant_settings":
      return authorizeTenantSettings(input);
    case "branch_operations":
      return authorizeBranchOperations(input);
    case "website":
      return authorizeWebsite(input);
    case "customer_account":
      return authorizeCustomerAccount(input);
    default:
      return deny("unsupported_resource", {
        debug: {
          policyFamily: String((input.resource as { family?: string }).family ?? "unknown"),
        },
      });
  }
}
```

Update `packages/authz/src/index.ts`:

```ts
export const authzPackageName = "@vision/authz" as const;

export { authorize } from "./authorize";
export {
  AuthzError,
  isAuthzError,
  requireAuthorization,
  type AuthzErrorOptions,
} from "./errors";
export type {
  AuthorizationAction,
  AuthorizationActorClaims,
  AuthorizationContextFacts,
  AuthorizationDecision,
  AuthorizationDecisionDebug,
  AuthorizationDeniedCode,
  AuthorizationInput,
  AuthorizationResource,
  InternalPlatformRole,
  InternalTenantRole,
} from "./types";
```

- [ ] **Step 4: Run the authz package tests to verify they pass**

Run:

```powershell
pnpm --filter @vision/authz test -- src/errors.test.ts src/authorize.test.ts
```

Expected: PASS with `11 passed`.

- [ ] **Step 5: Commit**

```powershell
git add packages/authz/src/authorize.ts packages/authz/src/authorize.test.ts packages/authz/src/index.ts
git commit -m "feat: add phase 7 authorization policies"
```

### Task 3: Add the API Authz Guard and Error Translation

**Files:**
- Create: `apps/api/src/auth-request.ts`
- Create: `apps/api/src/authz-guard.ts`
- Create: `apps/api/src/authz-guard.test.ts`
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/auth-plugin.ts`
- Modify: `apps/api/src/http-errors.ts`
- Modify: `packages/observability/src/problem-details.ts`
- Modify: `packages/observability/src/problem-details.test.ts`
- Modify: `packages/observability/src/errors.ts`
- Modify: `packages/observability/src/errors.test.ts`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Write the failing observability and API guard tests**

Append this case to `packages/observability/src/problem-details.test.ts`:

```ts
it("supports authz denial codes without exposing debug metadata", () => {
  const value = createProblemDetails({
    type: "https://vision.dev/problems/forbidden",
    title: "Forbidden",
    status: 403,
    code: "missing_context",
    detail: "Forbidden",
    requiredAssurance: "step_up_verified",
  });

  expect(value.code).toBe("missing_context");
  expect(value.requiredAssurance).toBe("step_up_verified");
  expect(value).not.toHaveProperty("debug");
  expect(value.denialReason).toBeUndefined();
});
```

Update the import and append this case in `packages/observability/src/errors.test.ts`:

```ts
import {
  ProblemError,
  getProblemDefinitionForStatus,
  isProblemError,
  serializeErrorForLog,
} from "./errors";

it("serializeErrorForLog carries safe debug metadata for authz-style errors", () => {
  const error = Object.assign(new Error("Forbidden"), {
    code: "insufficient_scope",
    requiredAssurance: "step_up_verified",
    debug: {
      policyFamily: "tenant_settings",
      missingFacts: ["targetTenantId"],
    },
  });

  expect(serializeErrorForLog(error)).toMatchObject({
    code: "insufficient_scope",
    requiredAssurance: "step_up_verified",
    debug: {
      policyFamily: "tenant_settings",
      missingFacts: ["targetTenantId"],
    },
  });
});
```

Create `apps/api/src/authz-guard.test.ts`:

```ts
import { randomUUID } from "node:crypto";

import { inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createAuthnService,
  hashPassword,
  normalizeLoginIdentifier,
} from "@vision/authn";
import {
  authAccountEvents,
  authSessions,
  authSubjects,
  closeDatabasePool,
  createDatabaseClient,
  createDatabasePool,
  getDatabaseRuntimeConfig,
} from "@vision/db";

import { AUTH_SESSION_COOKIE_NAME } from "./auth-cookie";
import {
  createAuthorizationGuard,
  type AuthorizationGuardOptions,
} from "./authz-guard";
import { buildApi } from "./server";

const AUTHZ_GUARD_TEST_TIMEOUT_MS = 20_000;
const MFA_ENCRYPTION_KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
const FIXED_TEST_TIME = new Date("2026-04-21T12:00:00.000Z");
const { appEnv, databaseUrl } = getDatabaseRuntimeConfig(process.env);

const runtime = {
  appEnv,
  host: "127.0.0.1",
  port: 4000,
  databaseUrl,
  mfaEncryptionKey: MFA_ENCRYPTION_KEY,
  mfaEncryptionKeyVersion: "v1",
  logLevel: "debug",
  serviceName: "vision-api",
} as const;

const pool = createDatabasePool(databaseUrl);
const db = createDatabaseClient(pool);
const authn = createAuthnService(db, {
  now: () => new Date(FIXED_TEST_TIME),
  sessionTtlMs: 60 * 60 * 1000,
  mfaEncryptionKey: MFA_ENCRYPTION_KEY,
  mfaEncryptionKeyVersion: "v1",
  totpIssuer: "Vision",
});
let createdSubjectIds: string[] = [];
let createdSessionIds: string[] = [];

function getAuthCookie(setCookie: string | string[] | undefined): string {
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;

  if (!raw) {
    throw new Error("Missing Set-Cookie header.");
  }

  return raw.split(";")[0] ?? raw;
}

function extractSessionId(cookie: string): string {
  return cookie.replace(`${AUTH_SESSION_COOKIE_NAME}=`, "").split(".")[0] ?? "";
}

async function seedSubject(
  subjectType: "customer" | "internal",
  loginIdentifier: string,
  password: string,
) {
  const id = `sub_${randomUUID()}`;
  createdSubjectIds.push(id);

  await db.insert(authSubjects).values({
    id,
    subjectType,
    loginIdentifier,
    normalizedLoginIdentifier: normalizeLoginIdentifier(loginIdentifier),
    passwordHash: await hashPassword(password),
    internalSensitivity: subjectType === "internal" ? "none" : null,
  });
}

function registerGuardedRoute(
  api: FastifyInstance,
  input: AuthorizationGuardOptions & {
    method: "GET" | "POST";
    url: string;
  },
) {
  api.route({
    method: input.method,
    url: input.url,
    preHandler: createAuthorizationGuard(input),
    handler: async () => ({ ok: true }),
  });
}

async function loginAndGetCookie(
  api: FastifyInstance,
  subjectType: "customer" | "internal",
  loginIdentifier: string,
  password: string,
) {
  const response = await api.inject({
    method: "POST",
    url: subjectType === "customer" ? "/auth/customer/login" : "/auth/internal/login",
    payload: {
      loginIdentifier,
      password,
    },
  });
  const cookie = getAuthCookie(response.headers["set-cookie"]);
  createdSessionIds.push(extractSessionId(cookie));

  return cookie;
}

describe("createAuthorizationGuard", () => {
  beforeEach(() => {
    createdSubjectIds = [];
    createdSessionIds = [];
  });

  afterEach(async () => {
    if (createdSessionIds.length > 0) {
      await db
        .delete(authAccountEvents)
        .where(inArray(authAccountEvents.sessionId, createdSessionIds));
      await db.delete(authSessions).where(inArray(authSessions.id, createdSessionIds));
    }

    if (createdSubjectIds.length > 0) {
      await db
        .delete(authAccountEvents)
        .where(inArray(authAccountEvents.subjectId, createdSubjectIds));
      await db.delete(authSubjects).where(inArray(authSubjects.id, createdSubjectIds));
    }
  });

  afterAll(async () => {
    await closeDatabasePool(pool);
  });

  it(
    "returns 401 before authz when no authenticated session exists",
    async () => {
      const api = buildApi({ runtime, authService: authn });
      registerGuardedRoute(api, {
        method: "GET",
        url: "/_test/tenant-settings/:tenantId",
        resource: { family: "tenant_settings" },
        action: "read",
        getActorClaims: (_request, auth) => ({
          actorType: "internal",
          subjectId: auth.subject.id,
          currentAssurance: auth.session.assuranceLevel,
          tenantRole: "tenant_owner",
        }),
        getContextFacts: (request) => {
          const { tenantId } = request.params as { tenantId: string };
          return {
            activeTenantId: tenantId,
            targetTenantId: tenantId,
          };
        },
      });

      const response = await api.inject({
        method: "GET",
        url: "/_test/tenant-settings/tenant_1",
      });

      expect(response.statusCode).toBe(401);
      await api.close();
    },
    AUTHZ_GUARD_TEST_TIMEOUT_MS,
  );

  it(
    "returns 403 insufficient_scope without leaking debug metadata",
    async () => {
      const api = buildApi({ runtime, authService: authn });
      registerGuardedRoute(api, {
        method: "GET",
        url: "/_test/tenant-settings/:tenantId",
        resource: { family: "tenant_settings" },
        action: "read",
        getContextFacts: (request) => {
          const { tenantId } = request.params as { tenantId: string };
          return {
            activeTenantId: tenantId,
            targetTenantId: tenantId,
          };
        },
      });

      const loginIdentifier = `internal+${randomUUID()}@vision.test`;
      await seedSubject("internal", loginIdentifier, "S3cure-password!");
      const cookie = await loginAndGetCookie(
        api,
        "internal",
        loginIdentifier,
        "S3cure-password!",
      );

      const response = await api.inject({
        method: "GET",
        url: "/_test/tenant-settings/tenant_1",
        headers: {
          cookie,
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        code: "insufficient_scope",
      });
      expect(response.json()).not.toHaveProperty("debug");
      expect(response.json()).not.toHaveProperty("denialReason");

      await api.close();
    },
    AUTHZ_GUARD_TEST_TIMEOUT_MS,
  );

  it(
    "returns 403 missing_context when branch facts are absent",
    async () => {
      const api = buildApi({ runtime, authService: authn });
      registerGuardedRoute(api, {
        method: "GET",
        url: "/_test/branches",
        resource: { family: "branch_operations" },
        action: "read",
        getActorClaims: (_request, auth) => ({
          actorType: "internal",
          subjectId: auth.subject.id,
          currentAssurance: auth.session.assuranceLevel,
          tenantRole: "branch_manager",
          assignedBranchIds: ["branch_1"],
        }),
        getContextFacts: () => ({
          activeTenantId: "tenant_1",
          targetTenantId: "tenant_1",
        }),
      });

      const loginIdentifier = `branch+${randomUUID()}@vision.test`;
      await seedSubject("internal", loginIdentifier, "S3cure-password!");
      const cookie = await loginAndGetCookie(
        api,
        "internal",
        loginIdentifier,
        "S3cure-password!",
      );

      const response = await api.inject({
        method: "GET",
        url: "/_test/branches",
        headers: {
          cookie,
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        code: "missing_context",
      });
      expect(response.json()).not.toHaveProperty("debug");

      await api.close();
    },
    AUTHZ_GUARD_TEST_TIMEOUT_MS,
  );

  it(
    "returns 403 insufficient_assurance with requiredAssurance for website updates",
    async () => {
      const api = buildApi({ runtime, authService: authn });
      registerGuardedRoute(api, {
        method: "POST",
        url: "/_test/website/:tenantId",
        resource: { family: "website" },
        action: "update",
        getActorClaims: (_request, auth) => ({
          actorType: "internal",
          subjectId: auth.subject.id,
          currentAssurance: auth.session.assuranceLevel,
          tenantRole: "tenant_owner",
        }),
        getContextFacts: (request) => {
          const { tenantId } = request.params as { tenantId: string };
          return {
            activeTenantId: tenantId,
            targetTenantId: tenantId,
          };
        },
      });

      const loginIdentifier = `owner+${randomUUID()}@vision.test`;
      await seedSubject("internal", loginIdentifier, "S3cure-password!");
      const cookie = await loginAndGetCookie(
        api,
        "internal",
        loginIdentifier,
        "S3cure-password!",
      );

      const response = await api.inject({
        method: "POST",
        url: "/_test/website/tenant_1",
        headers: {
          cookie,
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        code: "insufficient_assurance",
        requiredAssurance: "step_up_verified",
      });
      expect(response.json()).not.toHaveProperty("debug");
      expect(response.json()).not.toHaveProperty("denialReason");

      await api.close();
    },
    AUTHZ_GUARD_TEST_TIMEOUT_MS,
  );

  it(
    "allows explicit customer self-access and denies non-self access",
    async () => {
      const api = buildApi({ runtime, authService: authn });

      api.get(
        "/_test/customers/self",
        {
          preHandler: createAuthorizationGuard({
            resource: { family: "customer_account" },
            action: "read",
            getContextFacts: (_request, auth) => ({
              resourceOwnerSubjectId: auth.subject.id,
            }),
          }),
        },
        async () => ({ ok: true }),
      );

      api.get(
        "/_test/customers/other",
        {
          preHandler: createAuthorizationGuard({
            resource: { family: "customer_account" },
            action: "read",
            getContextFacts: () => ({
              resourceOwnerSubjectId: "sub_other",
            }),
          }),
        },
        async () => ({ ok: true }),
      );

      const loginIdentifier = `customer+${randomUUID()}@vision.test`;
      await seedSubject("customer", loginIdentifier, "S3cure-password!");
      const cookie = await loginAndGetCookie(
        api,
        "customer",
        loginIdentifier,
        "S3cure-password!",
      );

      const allowed = await api.inject({
        method: "GET",
        url: "/_test/customers/self",
        headers: {
          cookie,
        },
      });
      expect(allowed.statusCode).toBe(200);
      expect(allowed.json()).toEqual({ ok: true });

      const denied = await api.inject({
        method: "GET",
        url: "/_test/customers/other",
        headers: {
          cookie,
        },
      });
      expect(denied.statusCode).toBe(403);
      expect(denied.json()).toMatchObject({
        code: "self_access_only",
      });
      expect(denied.json()).not.toHaveProperty("debug");

      await api.close();
    },
    AUTHZ_GUARD_TEST_TIMEOUT_MS,
  );
});
```

- [ ] **Step 2: Run the observability and authz-guard tests to verify they fail**

Run:

```powershell
$env:APP_ENV='test'
$env:DATABASE_URL='postgresql://vision_local:vision_local_password@localhost:5433/vision_local'
$env:AUTH_MFA_ENCRYPTION_KEY='MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY='
$env:AUTH_MFA_ENCRYPTION_KEY_VERSION='v1'
pnpm --filter @vision/observability test -- src/problem-details.test.ts src/errors.test.ts
pnpm --filter @vision/api test -- src/authz-guard.test.ts
```

Expected: FAIL because authz denial codes are not part of the observability problem model, `serializeErrorForLog` does not preserve `debug`, and the API authz guard does not exist yet.

- [ ] **Step 3: Add the API authz guard, shared 401 helper, and error translation**

Update `apps/api/package.json`:

```json
{
  "name": "@vision/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsup src/index.ts --format esm --dts --out-dir dist",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run"
  },
  "dependencies": {
    "@fastify/cookie": "^11.0.2",
    "@vision/authn": "workspace:*",
    "@vision/authz": "workspace:*",
    "@vision/config": "workspace:*",
    "@vision/db": "workspace:*",
    "@vision/observability": "workspace:*",
    "drizzle-orm": "^0.45.2",
    "fastify": "latest"
  },
  "devDependencies": {
    "otpauth": "^9.4.1"
  }
}
```

Create `apps/api/src/auth-request.ts`:

```ts
import type { AuthResolution, AuthnErrorCode } from "@vision/authn";
import {
  ProblemError,
  getProblemDefinitionForStatus,
} from "@vision/observability";

type RequestAuthState = {
  auth: AuthResolution | null;
  authFailure: AuthnErrorCode | null;
};

export function getAuthFailureDetail(code: AuthnErrorCode | null): string {
  switch (code) {
    case "invalid_credentials":
      return "Invalid login credentials.";
    case "expired_session":
      return "Session has expired.";
    case "revoked_session":
      return "Session has been revoked.";
    default:
      return "Authentication required.";
  }
}

export function createUnauthenticatedProblem(detail: string): ProblemError {
  return new ProblemError({
    ...getProblemDefinitionForStatus(401),
    detail,
  });
}

export function requireAuthenticatedRequest(
  request: RequestAuthState,
): AuthResolution {
  if (request.auth) {
    return request.auth;
  }

  throw createUnauthenticatedProblem(getAuthFailureDetail(request.authFailure));
}
```

Create `apps/api/src/authz-guard.ts`:

```ts
import type { AuthResolution } from "@vision/authn";
import {
  authorize,
  requireAuthorization,
  type AuthorizationAction,
  type AuthorizationActorClaims,
  type AuthorizationContextFacts,
  type AuthorizationResource,
} from "@vision/authz";
import type { FastifyRequest } from "fastify";

import { requireAuthenticatedRequest } from "./auth-request";

export type AuthorizationGuardOptions = {
  resource: AuthorizationResource;
  action: AuthorizationAction;
  getActorClaims?: (
    request: FastifyRequest,
    auth: AuthResolution,
  ) => AuthorizationActorClaims;
  getContextFacts: (
    request: FastifyRequest,
    auth: AuthResolution,
  ) => AuthorizationContextFacts;
};

function deriveDefaultActorClaims(
  auth: AuthResolution,
): AuthorizationActorClaims {
  if (auth.subject.subjectType === "customer") {
    return {
      actorType: "customer",
      subjectId: auth.subject.id,
      currentAssurance: auth.session.assuranceLevel,
    };
  }

  return {
    actorType: "internal",
    subjectId: auth.subject.id,
    currentAssurance: auth.session.assuranceLevel,
  };
}

export function createAuthorizationGuard(options: AuthorizationGuardOptions) {
  return async function authorizationGuard(request: FastifyRequest) {
    const auth = requireAuthenticatedRequest(request);
    const actor =
      options.getActorClaims?.(request, auth) ?? deriveDefaultActorClaims(auth);
    const context = options.getContextFacts(request, auth);
    const decision = authorize({
      actor,
      resource: options.resource,
      action: options.action,
      context,
    });

    requireAuthorization(decision);
  };
}
```

Update `apps/api/src/auth-plugin.ts`:

```ts
import fastifyCookie from "@fastify/cookie";
import type { FastifyPluginAsync } from "fastify";

import {
  AuthnError,
  createAuthnService,
  isAuthnError,
  type AuthnService,
} from "@vision/authn";
import { closeDatabasePool, createRuntimeDatabase } from "@vision/db";
import { ProblemError } from "@vision/observability";

import {
  createUnauthenticatedProblem,
  getAuthFailureDetail,
  requireAuthenticatedRequest,
} from "./auth-request";
import type { ApiRuntimeConfig } from "./runtime";
import {
  clearAuthCookie,
  readAuthCookie,
  setAuthCookie,
} from "./auth-cookie";

type AuthPluginOptions = {
  runtime: ApiRuntimeConfig;
  authService?: AuthnService;
};

function insufficientAssurance(error: AuthnError): ProblemError {
  return new ProblemError({
    status: 403,
    code: "insufficient_assurance",
    title: "Insufficient Assurance",
    type: "https://vision.local/problems/insufficient-assurance",
    detail: error.message,
    requiredAssurance: error.context.requiredAssurance,
    denialReason: error.context.denialReason,
  });
}

function mapAuthnError(error: AuthnError): never {
  if (error.code === "insufficient_assurance") {
    throw insufficientAssurance(error);
  }

  if (
    error.code === "invalid_assurance_challenge" ||
    error.code === "expired_assurance_challenge" ||
    error.code === "consumed_assurance_challenge" ||
    error.code === "invalid_totp_code" ||
    error.code === "invalid_backup_code"
  ) {
    throw new ProblemError({
      type: "https://vision.local/problems/validation-error",
      title: "Validation Error",
      status: 422,
      code: "validation_error",
      detail: error.message,
    });
  }

  throw createUnauthenticatedProblem(getAuthFailureDetail(error.code));
}

function getRuntimeDatabase(options: AuthPluginOptions) {
  if (options.authService) {
    return null;
  }

  return createRuntimeDatabase({
    appEnv: options.runtime.appEnv,
    databaseUrl: options.runtime.databaseUrl,
  });
}

export const authPlugin: FastifyPluginAsync<AuthPluginOptions> = async (
  api,
  options,
) => {
  await api.register(fastifyCookie);

  const runtimeDatabase = getRuntimeDatabase(options);
  const authService =
    options.authService ??
    createAuthnService(
      (() => {
        if (!runtimeDatabase) {
          throw new Error("Expected runtime database when authService is not provided.");
        }

        return runtimeDatabase.db;
      })(),
      {
        mfaEncryptionKey: options.runtime.mfaEncryptionKey,
        mfaEncryptionKeyVersion: options.runtime.mfaEncryptionKeyVersion,
      },
    );

  if (runtimeDatabase) {
    api.addHook("onClose", async () => {
      await closeDatabasePool(runtimeDatabase.pool);
    });
  }

  api.decorateRequest("auth", null);
  api.decorateRequest("authFailure", null);

  api.addHook("onRequest", async (request) => {
    const token = readAuthCookie(request);
    request.auth = null;
    request.authFailure = null;

    if (!token) {
      return;
    }

    try {
      request.auth = await authService.resolveSession({ token });
    } catch (error) {
      if (isAuthnError(error)) {
        request.authFailure = error.code;
        return;
      }

      throw error;
    }
  });

  const loginSchema = {
    body: {
      type: "object",
      required: ["loginIdentifier", "password"],
      additionalProperties: false,
      properties: {
        loginIdentifier: { type: "string", minLength: 1 },
        password: { type: "string", minLength: 1 },
      },
    },
  } as const;

  api.post("/auth/customer/login", { schema: loginSchema }, async (request, reply) => {
    try {
      const body = request.body as { loginIdentifier: string; password: string };
      const result = await authService.login({
        subjectType: "customer",
        loginIdentifier: body.loginIdentifier,
        password: body.password,
      });

      if (result.kind !== "session") {
        throw new Error("Customer login must not require MFA.");
      }

      setAuthCookie(
        reply,
        options.runtime.appEnv,
        result.sessionToken,
        result.session.expiresAt,
      );

      return {
        subject: result.subject,
        session: result.session,
      };
    } catch (error) {
      if (isAuthnError(error)) {
        mapAuthnError(error);
      }

      throw error;
    }
  });

  api.post("/auth/internal/login", { schema: loginSchema }, async (request, reply) => {
    try {
      const body = request.body as { loginIdentifier: string; password: string };
      const result = await authService.login({
        subjectType: "internal",
        loginIdentifier: body.loginIdentifier,
        password: body.password,
      });

      if (result.kind === "mfa_challenge") {
        reply.code(202);
        return result;
      }

      setAuthCookie(
        reply,
        options.runtime.appEnv,
        result.sessionToken,
        result.session.expiresAt,
      );

      return {
        subject: result.subject,
        session: result.session,
      };
    } catch (error) {
      if (isAuthnError(error)) {
        mapAuthnError(error);
      }

      throw error;
    }
  });

  api.post("/auth/internal/mfa/enrollment/start", async (request) => {
    try {
      const body = request.body as { challengeToken: string; accountName: string };
      return authService.startMfaEnrollment(body);
    } catch (error) {
      if (isAuthnError(error)) {
        mapAuthnError(error);
      }

      throw error;
    }
  });

  api.post("/auth/internal/mfa/enrollment/verify", async (request, reply) => {
    try {
      const body = request.body as { challengeToken: string; code: string };
      const result = await authService.verifyMfaEnrollment(body);

      setAuthCookie(reply, options.runtime.appEnv, result.sessionToken, result.session.expiresAt);
      return {
        subject: result.subject,
        session: result.session,
        backupCodes: result.backupCodes,
      };
    } catch (error) {
      if (isAuthnError(error)) {
        mapAuthnError(error);
      }

      throw error;
    }
  });

  api.post("/auth/internal/mfa/verify", async (request, reply) => {
    try {
      const body = request.body as {
        challengeToken: string;
        code?: string;
        backupCode?: string;
      };
      const result = await authService.verifyMfaChallenge({
        challengeToken: body.challengeToken,
        totpCode: body.code,
        backupCode: body.backupCode,
      });

      setAuthCookie(reply, options.runtime.appEnv, result.sessionToken, result.session.expiresAt);
      return {
        subject: result.subject,
        session: result.session,
      };
    } catch (error) {
      if (isAuthnError(error)) {
        mapAuthnError(error);
      }

      throw error;
    }
  });

  api.post("/auth/internal/assurance/step-up/start", async (request) => {
    requireAuthenticatedRequest(request);
    const token = readAuthCookie(request);

    if (!token) {
      throw createUnauthenticatedProblem("Authentication required.");
    }

    try {
      const body = request.body as { reason: string };
      return await authService.startStepUpChallenge({
        token,
        reason: body.reason as
          | "tenant_context_switch"
          | "support_grant_activation"
          | "website_management_write"
          | "data_export"
          | "credential_reset",
      });
    } catch (error) {
      if (isAuthnError(error)) {
        mapAuthnError(error);
      }

      throw error;
    }
  });

  api.post("/auth/internal/assurance/step-up/verify", async (request) => {
    requireAuthenticatedRequest(request);
    const token = readAuthCookie(request);

    if (!token) {
      throw createUnauthenticatedProblem("Authentication required.");
    }

    try {
      const body = request.body as {
        challengeToken: string;
        code?: string;
        backupCode?: string;
      };
      const result = await authService.verifyStepUpChallenge({
        token,
        challengeToken: body.challengeToken,
        totpCode: body.code,
        backupCode: body.backupCode,
      });

      return {
        subject: result.subject,
        session: result.session,
      };
    } catch (error) {
      if (isAuthnError(error)) {
        mapAuthnError(error);
      }

      throw error;
    }
  });

  api.post("/auth/internal/mfa/backup-codes/regenerate", async (request) => {
    requireAuthenticatedRequest(request);
    const token = readAuthCookie(request);

    if (!token) {
      throw createUnauthenticatedProblem("Authentication required.");
    }

    try {
      const backupCodes = await authService.regenerateBackupCodes({ token });
      return { backupCodes };
    } catch (error) {
      if (isAuthnError(error)) {
        mapAuthnError(error);
      }

      throw error;
    }
  });

  api.get("/auth/session", async (request, reply) => {
    try {
      return requireAuthenticatedRequest(request);
    } catch (error) {
      clearAuthCookie(reply, options.runtime.appEnv);
      throw error;
    }
  });

  api.post("/auth/logout", async (request, reply) => {
    const token = readAuthCookie(request);

    if (!token) {
      clearAuthCookie(reply, options.runtime.appEnv);
      throw createUnauthenticatedProblem("Authentication required.");
    }

    try {
      await authService.logout({ token });
      clearAuthCookie(reply, options.runtime.appEnv);
      reply.code(204);
      return reply.send();
    } catch (error) {
      clearAuthCookie(reply, options.runtime.appEnv);

      if (isAuthnError(error)) {
        mapAuthnError(error);
      }

      throw error;
    }
  });
};
```

Update `packages/observability/src/problem-details.ts`:

```ts
import { sanitizeObservabilityId } from "./ids";

export type ProblemCode =
  | "internal_error"
  | "validation_error"
  | "unauthenticated"
  | "forbidden"
  | "insufficient_assurance"
  | "unsupported_actor"
  | "unsupported_resource"
  | "unsupported_action"
  | "missing_context"
  | "insufficient_scope"
  | "self_access_only"
  | "explicit_deny"
  | "not_found"
  | "conflict";

export type ProblemRequiredAssurance =
  | "basic"
  | "mfa_verified"
  | "step_up_verified";

export type ProblemDenialReason =
  | "mfa_required"
  | "step_up_required"
  | "step_up_stale";

export interface ProblemValidationIssue {
  path: string;
  message: string;
  code?: string;
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: ProblemCode;
  detail: string;
  instance: string;
  requiredAssurance?: ProblemRequiredAssurance;
  denialReason?: ProblemDenialReason;
  traceId?: string;
  errors?: ProblemValidationIssue[];
}

export type ProblemDetailsInput = Omit<ProblemDetails, "instance"> & {
  instance?: string;
};

function sanitizeAuthorityLikePath(value: string): string {
  const withoutLeadingSlashes = value.replace(/^\/+/, "");
  const firstPathSeparator = withoutLeadingSlashes.indexOf("/");

  if (firstPathSeparator === -1) {
    return "/";
  }

  return withoutLeadingSlashes.slice(firstPathSeparator);
}

export function sanitizeProblemInstance(value: string | undefined): string {
  if (typeof value !== "string") {
    return "/";
  }

  const input = value.trim();
  if (input.length === 0) {
    return "/";
  }

  let pathOnly: string;

  try {
    const parsed = new URL(input);
    pathOnly = parsed.pathname;
  } catch {
    const withoutQueryOrHash = input.split("?")[0]?.split("#")[0] ?? "";
    pathOnly = withoutQueryOrHash.startsWith("//")
      ? sanitizeAuthorityLikePath(withoutQueryOrHash)
      : withoutQueryOrHash;
  }

  if (pathOnly.length === 0) {
    return "/";
  }

  return pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`;
}

export function createProblemDetails(input: ProblemDetailsInput): ProblemDetails {
  const next: ProblemDetails = {
    type: input.type,
    title: input.title,
    status: input.status,
    code: input.code,
    detail: input.detail,
    instance: sanitizeProblemInstance(input.instance),
  };

  if (input.requiredAssurance !== undefined) {
    next.requiredAssurance = input.requiredAssurance;
  }

  if (input.denialReason !== undefined) {
    next.denialReason = input.denialReason;
  }

  const traceId = sanitizeObservabilityId(input.traceId);
  if (traceId !== undefined) {
    next.traceId = traceId;
  }

  if (input.code === "validation_error" && input.errors !== undefined) {
    next.errors = input.errors;
  }

  return next;
}
```

Update `packages/observability/src/errors.ts`:

```ts
import {
  createProblemDetails,
  type ProblemCode,
  type ProblemDenialReason,
  type ProblemDetails,
  type ProblemRequiredAssurance,
} from "./problem-details";

export interface ProblemDefinition {
  status: 401 | 403 | 404 | 409 | 422 | 500;
  code: ProblemCode;
  title: string;
  type: string;
}

export type ProblemErrorOptions = ProblemDefinition & {
  detail: string;
  instance?: string;
  traceId?: string;
  requiredAssurance?: ProblemRequiredAssurance;
  denialReason?: ProblemDenialReason;
  errors?: ProblemDetails["errors"];
};

const PROBLEM_BASE_URL = "https://vision.local/problems";

const PROBLEM_DEFINITIONS: Record<ProblemDefinition["status"], ProblemDefinition> = {
  401: {
    status: 401,
    code: "unauthenticated",
    title: "Unauthenticated",
    type: `${PROBLEM_BASE_URL}/unauthenticated`,
  },
  403: {
    status: 403,
    code: "forbidden",
    title: "Forbidden",
    type: `${PROBLEM_BASE_URL}/forbidden`,
  },
  404: {
    status: 404,
    code: "not_found",
    title: "Not Found",
    type: `${PROBLEM_BASE_URL}/not-found`,
  },
  409: {
    status: 409,
    code: "conflict",
    title: "Conflict",
    type: `${PROBLEM_BASE_URL}/conflict`,
  },
  422: {
    status: 422,
    code: "validation_error",
    title: "Validation Error",
    type: `${PROBLEM_BASE_URL}/validation-error`,
  },
  500: {
    status: 500,
    code: "internal_error",
    title: "Internal Server Error",
    type: `${PROBLEM_BASE_URL}/internal-error`,
  },
};

const PROBLEM_ERROR_NAME = "ProblemError";

export function getProblemDefinitionForStatus(status: number): ProblemDefinition {
  if (status in PROBLEM_DEFINITIONS) {
    return PROBLEM_DEFINITIONS[status as ProblemDefinition["status"]];
  }

  return PROBLEM_DEFINITIONS[500];
}

export class ProblemError extends Error {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly code: ProblemCode;
  readonly requiredAssurance?: ProblemRequiredAssurance;
  readonly denialReason?: ProblemDenialReason;
  readonly errors?: ProblemDetails["errors"];
  readonly problem: ProblemDetails;

  constructor(options: ProblemErrorOptions) {
    super(options.detail);
    this.name = PROBLEM_ERROR_NAME;
    this.type = options.type;
    this.title = options.title;
    this.status = options.status;
    this.code = options.code;
    this.requiredAssurance = options.requiredAssurance;
    this.denialReason = options.denialReason;
    this.errors = options.code === "validation_error" ? options.errors : undefined;
    this.problem = createProblemDetails({
      type: options.type,
      title: options.title,
      status: options.status,
      code: options.code,
      detail: options.detail,
      instance: options.instance,
      requiredAssurance: options.requiredAssurance,
      denialReason: options.denialReason,
      traceId: options.traceId,
      errors: this.errors,
    });
  }
}

export function isProblemError(value: unknown): value is ProblemError {
  return value instanceof ProblemError;
}

export function serializeErrorForLog(error: unknown): Record<string, unknown> {
  if (isProblemError(error)) {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      status: error.status,
      requiredAssurance: error.requiredAssurance,
      denialReason: error.denialReason,
    };
  }

  if (error instanceof Error) {
    const candidate = error as Error & {
      code?: unknown;
      status?: unknown;
      statusCode?: unknown;
      requiredAssurance?: unknown;
      denialReason?: unknown;
      debug?: unknown;
    };

    const serialized: Record<string, unknown> = {
      name: candidate.name,
      message: candidate.message,
    };

    if (typeof candidate.code === "string") {
      serialized.code = candidate.code;
    }

    if (typeof candidate.status === "number") {
      serialized.status = candidate.status;
    }

    if (typeof candidate.statusCode === "number") {
      serialized.statusCode = candidate.statusCode;
    }

    if (
      candidate.requiredAssurance === "basic" ||
      candidate.requiredAssurance === "mfa_verified" ||
      candidate.requiredAssurance === "step_up_verified"
    ) {
      serialized.requiredAssurance = candidate.requiredAssurance;
    }

    if (
      candidate.denialReason === "mfa_required" ||
      candidate.denialReason === "step_up_required" ||
      candidate.denialReason === "step_up_stale"
    ) {
      serialized.denialReason = candidate.denialReason;
    }

    if (
      candidate.debug !== undefined &&
      typeof candidate.debug === "object" &&
      candidate.debug !== null &&
      !Array.isArray(candidate.debug)
    ) {
      serialized.debug = candidate.debug;
    }

    return serialized;
  }

  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    const serialized: Record<string, unknown> = {};

    if (typeof record.name === "string") {
      serialized.name = record.name;
    }

    if (typeof record.message === "string") {
      serialized.message = record.message;
    }

    if (typeof record.code === "string") {
      serialized.code = record.code;
    }

    if (typeof record.status === "number") {
      serialized.status = record.status;
    }

    if (typeof record.statusCode === "number") {
      serialized.statusCode = record.statusCode;
    }

    if (
      record.requiredAssurance === "basic" ||
      record.requiredAssurance === "mfa_verified" ||
      record.requiredAssurance === "step_up_verified"
    ) {
      serialized.requiredAssurance = record.requiredAssurance;
    }

    if (
      record.denialReason === "mfa_required" ||
      record.denialReason === "step_up_required" ||
      record.denialReason === "step_up_stale"
    ) {
      serialized.denialReason = record.denialReason;
    }

    if (
      record.debug !== undefined &&
      typeof record.debug === "object" &&
      record.debug !== null &&
      !Array.isArray(record.debug)
    ) {
      serialized.debug = record.debug;
    }

    return serialized;
  }

  return {
    message: String(error),
  };
}
```

Update `apps/api/src/http-errors.ts`:

```ts
import { STATUS_CODES } from "node:http";

import { AuthzError, isAuthzError } from "@vision/authz";
import type { FastifyRequest } from "fastify";

import {
  ProblemError,
  createProblemDetails,
  getProblemDefinitionForStatus,
  isProblemError,
  sanitizeProblemInstance,
  type ObservabilityContext,
  type ProblemDetails,
  type ProblemValidationIssue,
} from "@vision/observability";

type FastifyValidationIssue = {
  instancePath?: string;
  message?: string;
  keyword?: string;
  params?: {
    missingProperty?: string;
  };
};

type FastifyValidationError = {
  validation?: FastifyValidationIssue[];
  validationContext?: string;
};

type StatusCodeError = {
  statusCode?: number;
};

export type ApiProblemResult = {
  statusCode: number;
  problem: ProblemDetails;
};

function hasValidationErrors(error: unknown): error is FastifyValidationError {
  return Array.isArray((error as FastifyValidationError | undefined)?.validation);
}

function hasStatusCode(error: unknown): error is StatusCodeError {
  return typeof (error as StatusCodeError | undefined)?.statusCode === "number";
}

function isClientErrorStatusCode(statusCode: number): boolean {
  return statusCode >= 400 && statusCode < 500;
}

function hasSharedProblemDefinition(statusCode: number): boolean {
  return [401, 403, 404, 409, 422].includes(statusCode);
}

function trimPathSegment(value: string): string {
  return value.replace(/^\/+|\/+$/g, "");
}

function getValidationPath(
  issue: FastifyValidationIssue,
  validationContext: string | undefined,
): string {
  const basePath = trimPathSegment(issue.instancePath ?? "");
  const missingProperty =
    typeof issue.params?.missingProperty === "string"
      ? trimPathSegment(issue.params.missingProperty)
      : "";
  const context = trimPathSegment(validationContext ?? "");
  const parts = [context, basePath, missingProperty].filter(
    (part) => part.length > 0,
  );

  return parts.join(".") || context || "body";
}

function mapValidationIssues(error: FastifyValidationError): ProblemValidationIssue[] {
  return (error.validation ?? []).map((issue) => ({
    path: getValidationPath(issue, error.validationContext),
    message: issue.message ?? "Invalid value.",
    code: issue.keyword,
  }));
}

function getRequestInstance(request: FastifyRequest): string {
  return sanitizeProblemInstance(request.url);
}

function createProblemFromError(
  error: ProblemError,
  request: FastifyRequest,
  context: ObservabilityContext,
): ApiProblemResult {
  return {
    statusCode: error.status,
    problem: createProblemDetails({
      type: error.type,
      title: error.title,
      status: error.status,
      code: error.code,
      detail: error.message,
      instance: getRequestInstance(request),
      requiredAssurance: error.requiredAssurance,
      denialReason: error.denialReason,
      traceId: context.traceId,
      errors: error.errors,
    }),
  };
}

function createAuthzProblem(
  error: AuthzError,
  request: FastifyRequest,
  context: ObservabilityContext,
): ApiProblemResult {
  const definition = getProblemDefinitionForStatus(403);

  return {
    statusCode: definition.status,
    problem: createProblemDetails({
      type: definition.type,
      title: definition.title,
      status: definition.status,
      code: error.code,
      detail: definition.title,
      instance: getRequestInstance(request),
      requiredAssurance: error.requiredAssurance,
      traceId: context.traceId,
    }),
  };
}

function createValidationProblem(
  error: FastifyValidationError,
  request: FastifyRequest,
  context: ObservabilityContext,
): ApiProblemResult {
  const definition = getProblemDefinitionForStatus(422);

  return {
    statusCode: definition.status,
    problem: createProblemDetails({
      ...definition,
      detail: "Request validation failed.",
      instance: getRequestInstance(request),
      traceId: context.traceId,
      errors: mapValidationIssues(error),
    }),
  };
}

function createGenericProblem(
  error: unknown,
  request: FastifyRequest,
  context: ObservabilityContext,
): ApiProblemResult {
  if (
    hasStatusCode(error) &&
    isClientErrorStatusCode(error.statusCode ?? 0) &&
    !hasSharedProblemDefinition(error.statusCode ?? 0)
  ) {
    const statusCode = error.statusCode ?? 400;
    const title = STATUS_CODES[statusCode] ?? "Bad Request";

    return {
      statusCode,
      problem: createProblemDetails({
        type: "https://vision.local/problems/validation-error",
        title,
        status: statusCode,
        code: "validation_error",
        detail: title,
        instance: getRequestInstance(request),
        traceId: context.traceId,
      }),
    };
  }

  const definition = hasStatusCode(error)
    ? getProblemDefinitionForStatus(error.statusCode ?? 500)
    : getProblemDefinitionForStatus(500);
  const detail =
    definition.status === 500 ? "An unexpected error occurred." : definition.title;

  return {
    statusCode: definition.status,
    problem: createProblemDetails({
      ...definition,
      detail,
      instance: getRequestInstance(request),
      traceId: context.traceId,
    }),
  };
}

export function mapApiErrorToProblem(
  error: unknown,
  request: FastifyRequest,
  context: ObservabilityContext,
): ApiProblemResult {
  if (isProblemError(error)) {
    return createProblemFromError(error, request, context);
  }

  if (isAuthzError(error)) {
    return createAuthzProblem(error, request, context);
  }

  if (hasValidationErrors(error)) {
    return createValidationProblem(error, request, context);
  }

  return createGenericProblem(error, request, context);
}
```

Refresh the lockfile:

```powershell
pnpm install
```

- [ ] **Step 4: Run the observability and API guard tests to verify they pass**

Run:

```powershell
$env:APP_ENV='test'
$env:DATABASE_URL='postgresql://vision_local:vision_local_password@localhost:5433/vision_local'
$env:AUTH_MFA_ENCRYPTION_KEY='MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY='
$env:AUTH_MFA_ENCRYPTION_KEY_VERSION='v1'
pnpm --filter @vision/observability test -- src/problem-details.test.ts src/errors.test.ts
pnpm --filter @vision/api test -- src/auth-routes.test.ts src/authz-guard.test.ts
```

Expected: PASS with the auth routes still green and the new authz-guard tests proving `401` before authz, `403` after authz, frozen safe denial payloads, and explicit customer self-access.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/package.json apps/api/src/auth-request.ts apps/api/src/auth-plugin.ts apps/api/src/authz-guard.ts apps/api/src/authz-guard.test.ts apps/api/src/http-errors.ts packages/observability/src/problem-details.ts packages/observability/src/problem-details.test.ts packages/observability/src/errors.ts packages/observability/src/errors.test.ts pnpm-lock.yaml
git commit -m "feat: add API authorization guard and error mapping"
```

### Task 4: Update Security Docs and Run Phase 7 Verification

**Files:**
- Create: `docs/security/authorization-engine.md`
- Modify: `docs/security/README.md`

- [ ] **Step 1: Write the Phase 7 security documentation**

Create `docs/security/authorization-engine.md`:

```md
# Authorization Engine

Phase 7 introduces the first centralized authorization engine for Vision.

## Boundary

- `packages/authz` owns the authorization vocabulary, dispatcher, deny codes, and transport-agnostic `AuthzError`
- `apps/api` owns request adaptation and HTTP error translation
- unauthenticated requests stop at `401` before authz
- authenticated denials map to `403`

## Phase 7 Minimal Authz Claims

Phase 7 uses normalized authorization claims only:

- `platformRole`
- `tenantRole`
- `assignedBranchIds`

These are temporary authz inputs, not the durable tenant, branch, or internal-user model.

## Context Facts

Policy evaluation uses request-time context facts:

- `activeTenantId`
- `activeBranchId`
- `targetTenantId`
- `targetBranchId`
- `resourceOwnerSubjectId`

Missing facts deny closed with `missing_context`.

## Deny Codes

Phase 7 freezes the authorization denial codes:

- `unsupported_actor`
- `unsupported_resource`
- `unsupported_action`
- `missing_context`
- `insufficient_scope`
- `insufficient_assurance`
- `self_access_only`
- `explicit_deny`

## Resource Families

Phase 7 supports:

- `platform_tenant_management`
- `tenant_settings`
- `branch_operations`
- `website`
- `customer_account`

Customer support remains narrow and explicit:

- only `customer_account`
- only supported self-access actions
- no broad customer policy matrix

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
```

Update `docs/security/README.md`:

```md
# Security

This folder contains security model notes for Vision.

Security decisions must preserve:

- tenant isolation
- centralized authorization
- database-backed sessions
- MFA and assurance levels for sensitive internal roles
- grant-based support access
- auditability for sensitive operations

Current implementation notes:

- [Authorization Engine](./authorization-engine.md)
- [MFA And Assurance](./mfa-and-assurance.md)
- [Logging And Error Safety](./logging-and-error-safety.md)
- [Secrets Strategy](./secrets-strategy.md)

The full security target is defined in `Vision_Greenfield_Blueprint.md` and `agent.md`.
```

- [ ] **Step 2: Run targeted Phase 7 verification**

Run:

```powershell
docker compose up -d postgres
$env:APP_ENV='local'
$env:DATABASE_URL='postgresql://vision_local:vision_local_password@localhost:5433/vision_local'
$env:DATABASE_ADMIN_URL='postgresql://vision_local:vision_local_password@localhost:5433/postgres'
$env:DATABASE_ADMIN_TARGET_DB='vision_local'
$env:API_HOST='0.0.0.0'
$env:API_PORT='4000'
$env:AUTH_MFA_ENCRYPTION_KEY='MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY='
$env:AUTH_MFA_ENCRYPTION_KEY_VERSION='v1'
$env:LOG_LEVEL='info'
pnpm db:reset
pnpm --filter @vision/authz test -- src/errors.test.ts src/authorize.test.ts
pnpm --filter @vision/observability test -- src/problem-details.test.ts src/errors.test.ts
pnpm --filter @vision/api test -- src/auth-routes.test.ts src/authz-guard.test.ts
```

Expected: database reset succeeds and all targeted Phase 7 tests pass with `0 failed`.

- [ ] **Step 3: Run repo-wide verification**

Run:

```powershell
$env:APP_ENV='local'
$env:DATABASE_URL='postgresql://vision_local:vision_local_password@localhost:5433/vision_local'
$env:DATABASE_ADMIN_URL='postgresql://vision_local:vision_local_password@localhost:5433/postgres'
$env:DATABASE_ADMIN_TARGET_DB='vision_local'
$env:API_HOST='0.0.0.0'
$env:API_PORT='4000'
$env:AUTH_MFA_ENCRYPTION_KEY='MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY='
$env:AUTH_MFA_ENCRYPTION_KEY_VERSION='v1'
$env:LOG_LEVEL='info'
pnpm test
pnpm lint
pnpm typecheck
```

Expected: all three commands exit `0`.

- [ ] **Step 4: Evaluate the Phase 7 roadmap exit criteria explicitly**

Use this checklist and report the result line-by-line:

```md
- [ ] unknown resource or action pairs deny by default
- [ ] branch-scoped actors cannot act outside assigned branch scope
- [ ] tenant-wide actions fail when active and target tenant scope do not match
- [ ] customer self-access is explicit and narrow
- [ ] authenticated denials return only safe metadata (`code`, `requiredAssurance?`)
- [ ] unauthenticated requests stop at `401` before authz
- [ ] assurance-sensitive actions deny with `requiredAssurance`
- [ ] authorization is centralized in `packages/authz`
- [ ] API routes can reuse a single authz guard instead of scattered role checks
- [ ] no Phase 10 or Phase 11 persistence was pulled into Phase 7
```

Decision rule:

- If every item above is true after fresh verification, report that the Phase 7 slice is complete.
- If any item is false, report that the Phase 7 slice is incomplete and list the exact remaining gap.

- [ ] **Step 5: Commit**

```powershell
git add docs/security/authorization-engine.md docs/security/README.md
git commit -m "docs: record phase 7 authorization engine"
```
