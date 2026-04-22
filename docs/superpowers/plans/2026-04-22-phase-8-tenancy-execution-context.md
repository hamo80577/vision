# Phase 8 Tenancy Execution Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 8 trusted internal ERP tenancy execution-context layer, add auditable active-branch switching, propagate trusted DB access context for tenant-scoped work, and prove the fail-closed request flow from authn through tenancy, authz, and DB helpers.

**Architecture:** Keep raw route intent, tenancy invariants, machine-readable tenancy errors, and resolved-context mapping in `packages/tenancy`. Keep `apps/api` thin by deriving raw route intent and trusted access snapshots at the edge, attaching resolved tenancy context to the request, and reusing Phase 7 authz after tenancy resolution. Keep `packages/db` limited to transaction-local context application, and keep session persistence and audit events for branch switching in `packages/authn`.

**Tech Stack:** TypeScript, Fastify, Vitest, PostgreSQL, Drizzle ORM, existing `@vision/authn`, `@vision/authz`, `@vision/db`, and `@vision/observability`

---

## File Structure

### Create

- `packages/tenancy/src/types.ts`
- `packages/tenancy/src/errors.ts`
- `packages/tenancy/src/errors.test.ts`
- `packages/tenancy/src/resolve-internal-tenancy-context.ts`
- `packages/tenancy/src/resolve-internal-tenancy-context.test.ts`
- `packages/tenancy/src/db-context.ts`
- `packages/db/src/access-context.ts`
- `packages/db/src/access-context.test.ts`
- `apps/api/src/tenancy-request.ts`
- `apps/api/src/tenancy-guard.ts`
- `apps/api/src/tenancy-guard.test.ts`
- `docs/security/tenancy-execution-context.md`
- `docs/adr/0005-transaction-local-tenancy-context.md`
- `db/migrations/0003_phase_8_tenancy_context.sql`
- `db/migrations/meta/0003_snapshot.json`

### Modify

- `packages/tenancy/package.json`
- `packages/tenancy/src/index.ts`
- `packages/db/package.json`
- `packages/db/src/index.ts`
- `packages/db/src/schema/auth.ts`
- `packages/observability/src/problem-details.ts`
- `packages/observability/src/problem-details.test.ts`
- `packages/authn/src/service.ts`
- `packages/authn/src/service.integration.test.ts`
- `packages/authn/src/index.ts`
- `apps/api/package.json`
- `apps/api/src/fastify-types.ts`
- `apps/api/src/http-errors.ts`
- `apps/api/src/authz-guard.ts`
- `apps/api/src/authz-guard.test.ts`
- `docs/security/README.md`
- `docs/security/database-role-strategy.md`
- `docs/architecture/module-boundaries.md`
- `db/migrations/meta/_journal.json`
- `pnpm-lock.yaml`

### Responsibilities

- `packages/tenancy/src/types.ts`: raw route intent, active-tenant access snapshot, resolved ERP tenancy context, DB access context, and Phase 8 error codes.
- `packages/tenancy/src/errors.ts`: `TenancyError`, `isTenancyError`, and `requireResolvedTenancyContext`.
- `packages/tenancy/src/resolve-internal-tenancy-context.ts`: fail-closed internal ERP tenancy resolver with platform deny-by-default and branch-switch validation.
- `packages/tenancy/src/db-context.ts`: map `ResolvedTenancyContext` to `DatabaseAccessContext`.
- `packages/db/src/access-context.ts`: thin transaction-local DB context application helpers.
- `packages/authn/src/service.ts`: add active-branch persistence method plus audit event write.
- `apps/api/src/tenancy-guard.ts`: resolve tenancy after authn, enrich request context, and attach `request.tenancy`.
- `apps/api/src/tenancy-request.ts`: request helpers for requiring resolved tenancy context in handlers.
- `apps/api/src/authz-guard.ts`: prefer resolved tenancy facts over raw session context when tenancy is attached.
- `apps/api/src/http-errors.ts`: map tenancy failures to stable problem payloads.
- `docs/security/tenancy-execution-context.md`: living Phase 8 security note.
- `docs/adr/0005-transaction-local-tenancy-context.md`: record the DB-context decision.

### Task 1: Add the Phase 8 Tenancy Contract and Error Primitives

**Files:**
- Create: `packages/tenancy/src/types.ts`
- Create: `packages/tenancy/src/errors.ts`
- Create: `packages/tenancy/src/errors.test.ts`
- Modify: `packages/tenancy/package.json`
- Modify: `packages/tenancy/src/index.ts`

- [ ] **Step 1: Write the failing tenancy-error test**

Create `packages/tenancy/src/errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  TenancyError,
  isTenancyError,
  requireResolvedTenancyContext,
  type ResolvedTenancyContext,
} from "./index";

describe("tenancy errors", () => {
  it("throws TenancyError with the machine-readable code when context is missing", () => {
    expect(() => requireResolvedTenancyContext(null)).toThrow(TenancyError);

    try {
      requireResolvedTenancyContext(null);
    } catch (error) {
      expect(isTenancyError(error)).toBe(true);
      expect(error).toMatchObject({
        code: "missing_active_tenant_context",
      });
    }
  });

  it("accepts an already resolved tenancy context", () => {
    const context: ResolvedTenancyContext = {
      surface: "erp",
      scope: "tenant",
      sessionId: "sess_1",
      subjectId: "sub_1",
      activeTenantId: "tenant_1",
      activeBranchId: null,
      targetTenantId: "tenant_1",
      targetBranchId: null,
      routeIntent: {
        surface: "erp",
        requestedScope: "tenant",
      },
      access: {
        tenantId: "tenant_1",
        allowedBranchIds: [],
      },
      branchSwitch: {
        requested: false,
        persisted: false,
        previousBranchId: null,
        nextBranchId: null,
      },
    };

    expect(requireResolvedTenancyContext(context)).toBe(context);
  });
});
```

- [ ] **Step 2: Run the tenancy-error test to verify it fails**

Run:

```powershell
pnpm --filter @vision/tenancy test -- src/errors.test.ts
```

Expected: FAIL because `TenancyError`, `isTenancyError`, `requireResolvedTenancyContext`, and the exported types do not exist yet.

- [ ] **Step 3: Add the tenancy package contract and error primitives**

Update `packages/tenancy/package.json`:

```json
{
  "name": "@vision/tenancy",
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
  }
}
```

Create `packages/tenancy/src/types.ts`:

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
```

Create `packages/tenancy/src/errors.ts`:

```ts
import type { ResolvedTenancyContext, TenancyErrorCode } from "./types";

const TENANCY_ERROR_NAME = "TenancyError";

const TENANCY_ERROR_MESSAGES: Record<TenancyErrorCode, string> = {
  unsupported_execution_surface: "This execution surface is not supported by the internal tenancy resolver.",
  platform_tenant_execution_disabled: "Platform tenant and branch execution is disabled in Phase 8.",
  missing_active_tenant_context: "Active tenant context is required.",
  missing_active_branch_context: "Active branch context is required.",
  tenant_intent_mismatch: "Route tenant intent does not match the active tenant context.",
  branch_intent_mismatch: "Route branch intent does not match the active branch context.",
  invalid_branch_switch_target: "A valid branch-switch target is required.",
  branch_not_in_active_tenant_scope: "The branch target is not allowed in the active tenant scope.",
  tenant_db_context_required: "Tenant-scoped database work requires DB access context.",
};

export class TenancyError extends Error {
  readonly code: TenancyErrorCode;

  constructor(code: TenancyErrorCode) {
    super(TENANCY_ERROR_MESSAGES[code]);
    this.name = TENANCY_ERROR_NAME;
    this.code = code;
  }
}

export function isTenancyError(value: unknown): value is TenancyError {
  return value instanceof TenancyError;
}

export function requireResolvedTenancyContext(
  context: ResolvedTenancyContext | null,
): ResolvedTenancyContext {
  if (context) {
    return context;
  }

  throw new TenancyError("missing_active_tenant_context");
}
```

Update `packages/tenancy/src/index.ts`:

```ts
export const tenancyPackageName = "@vision/tenancy" as const;

export {
  TenancyError,
  isTenancyError,
  requireResolvedTenancyContext,
} from "./errors";
export type {
  ActiveTenantAccessSnapshot,
  DatabaseAccessContext,
  RawRouteIntent,
  ResolvedTenancyContext,
  TenancyErrorCode,
} from "./types";
```

- [ ] **Step 4: Run the tenancy-error test to verify it passes**

Run:

```powershell
pnpm --filter @vision/tenancy test -- src/errors.test.ts
```

Expected: PASS with `2 passed`.

- [ ] **Step 5: Commit**

```powershell
git add packages/tenancy/package.json packages/tenancy/src/types.ts packages/tenancy/src/errors.ts packages/tenancy/src/errors.test.ts packages/tenancy/src/index.ts
git commit -m "feat: add tenancy contract and error primitives"
```

### Task 2: Implement the Internal ERP Tenancy Resolver and Context Mapper

**Files:**
- Create: `packages/tenancy/src/resolve-internal-tenancy-context.ts`
- Create: `packages/tenancy/src/resolve-internal-tenancy-context.test.ts`
- Create: `packages/tenancy/src/db-context.ts`
- Modify: `packages/tenancy/src/index.ts`

- [ ] **Step 1: Write the failing tenancy-resolver test**

Create `packages/tenancy/src/resolve-internal-tenancy-context.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  resolveInternalTenancyContext,
  toDatabaseAccessContext,
} from "./index";

const baseSession = {
  sessionId: "sess_1",
  subjectId: "sub_1",
  subjectType: "internal" as const,
  activeTenantId: "tenant_1",
  activeBranchId: "branch_1",
};

const baseAccess = {
  tenantId: "tenant_1",
  tenantRole: "branch_manager" as const,
  allowedBranchIds: ["branch_1", "branch_2"],
};

describe("resolveInternalTenancyContext", () => {
  it("rejects platform tenant execution by default", () => {
    expect(() =>
      resolveInternalTenancyContext({
        routeIntent: {
          surface: "platform",
          requestedScope: "tenant",
          tenantIntent: { source: "path", rawValue: "tenant_1" },
        },
        session: baseSession,
        access: baseAccess,
      }),
    ).toThrowErrorMatchingObject({
      code: "platform_tenant_execution_disabled",
    });
  });

  it("rejects missing active tenant context", () => {
    expect(() =>
      resolveInternalTenancyContext({
        routeIntent: { surface: "erp", requestedScope: "tenant" },
        session: { ...baseSession, activeTenantId: null },
        access: null,
      }),
    ).toThrowErrorMatchingObject({
      code: "missing_active_tenant_context",
    });
  });

  it("rejects branch intent mismatch outside switch flow", () => {
    expect(() =>
      resolveInternalTenancyContext({
        routeIntent: {
          surface: "erp",
          requestedScope: "branch",
          branchIntent: { source: "path", rawValue: "branch_2" },
        },
        session: baseSession,
        access: baseAccess,
      }),
    ).toThrowErrorMatchingObject({
      code: "branch_intent_mismatch",
    });
  });

  it("resolves a valid branch switch without persisting it", () => {
    const result = resolveInternalTenancyContext({
      routeIntent: {
        surface: "erp",
        requestedScope: "branch_switch",
        branchIntent: { source: "payload", rawValue: "branch_2" },
      },
      session: baseSession,
      access: baseAccess,
    });

    expect(result).toMatchObject({
      scope: "branch",
      activeTenantId: "tenant_1",
      activeBranchId: "branch_1",
      targetTenantId: "tenant_1",
      targetBranchId: "branch_2",
      branchSwitch: {
        requested: true,
        persisted: false,
        previousBranchId: "branch_1",
        nextBranchId: "branch_2",
      },
    });
  });

  it("maps the resolved context into database access context", () => {
    const result = resolveInternalTenancyContext({
      routeIntent: { surface: "erp", requestedScope: "branch" },
      session: baseSession,
      access: baseAccess,
    });

    expect(toDatabaseAccessContext(result)).toEqual({
      tenantId: "tenant_1",
      branchId: "branch_1",
      subjectId: "sub_1",
      subjectType: "internal",
      sessionId: "sess_1",
    });
  });
});
```

- [ ] **Step 2: Run the tenancy-resolver test to verify it fails**

Run:

```powershell
pnpm --filter @vision/tenancy test -- src/resolve-internal-tenancy-context.test.ts
```

Expected: FAIL because `resolveInternalTenancyContext` and `toDatabaseAccessContext` do not exist yet.

- [ ] **Step 3: Implement the internal ERP tenancy resolver and DB mapper**

Create `packages/tenancy/src/resolve-internal-tenancy-context.ts`:

```ts
import { TenancyError } from "./errors";
import type {
  ActiveTenantAccessSnapshot,
  RawRouteIntent,
  ResolvedTenancyContext,
} from "./types";

type InternalSessionTenancyState = {
  sessionId: string;
  subjectId: string;
  subjectType: "internal";
  activeTenantId: string | null;
  activeBranchId: string | null;
};

type InternalTenancyResolutionInput = {
  routeIntent: RawRouteIntent;
  session: InternalSessionTenancyState;
  access: ActiveTenantAccessSnapshot | null;
};

function readRawIntentValue(
  intent: RawRouteIntent["tenantIntent"] | RawRouteIntent["branchIntent"],
): string | null {
  const rawValue = intent?.rawValue?.trim();
  return rawValue ? rawValue : null;
}

function requireActiveTenantId(session: InternalSessionTenancyState): string {
  if (!session.activeTenantId) {
    throw new TenancyError("missing_active_tenant_context");
  }

  return session.activeTenantId;
}

function requireAccess(
  access: ActiveTenantAccessSnapshot | null,
): ActiveTenantAccessSnapshot {
  if (!access) {
    throw new TenancyError("missing_active_tenant_context");
  }

  return access;
}

export function resolveInternalTenancyContext(
  input: InternalTenancyResolutionInput,
): ResolvedTenancyContext {
  if (input.routeIntent.surface !== "erp") {
    throw new TenancyError(
      input.routeIntent.surface === "platform"
        ? "platform_tenant_execution_disabled"
        : "unsupported_execution_surface",
    );
  }

  const activeTenantId = requireActiveTenantId(input.session);
  const access = requireAccess(input.access);

  if (access.tenantId !== activeTenantId) {
    throw new TenancyError("tenant_intent_mismatch");
  }

  const tenantIntent = readRawIntentValue(input.routeIntent.tenantIntent);
  if (tenantIntent && tenantIntent !== activeTenantId) {
    throw new TenancyError("tenant_intent_mismatch");
  }

  const activeBranchId = input.session.activeBranchId ?? null;
  const branchIntent = readRawIntentValue(input.routeIntent.branchIntent);
  const isSwitch = input.routeIntent.requestedScope === "branch_switch";

  if (!isSwitch && input.routeIntent.requestedScope === "branch" && !activeBranchId) {
    throw new TenancyError("missing_active_branch_context");
  }

  if (isSwitch) {
    if (!branchIntent) {
      throw new TenancyError("invalid_branch_switch_target");
    }

    if (!access.allowedBranchIds.includes(branchIntent)) {
      throw new TenancyError("branch_not_in_active_tenant_scope");
    }

    return {
      surface: "erp",
      scope: "branch",
      sessionId: input.session.sessionId,
      subjectId: input.session.subjectId,
      activeTenantId,
      activeBranchId,
      targetTenantId: activeTenantId,
      targetBranchId: branchIntent,
      routeIntent: input.routeIntent,
      access,
      branchSwitch: {
        requested: true,
        persisted: false,
        previousBranchId: activeBranchId,
        nextBranchId: branchIntent,
      },
    };
  }

  if (branchIntent && branchIntent !== activeBranchId) {
    throw new TenancyError("branch_intent_mismatch");
  }

  return {
    surface: "erp",
    scope: input.routeIntent.requestedScope === "branch" ? "branch" : "tenant",
    sessionId: input.session.sessionId,
    subjectId: input.session.subjectId,
    activeTenantId,
    activeBranchId,
    targetTenantId: activeTenantId,
    targetBranchId: input.routeIntent.requestedScope === "branch" ? activeBranchId : null,
    routeIntent: input.routeIntent,
    access,
    branchSwitch: {
      requested: false,
      persisted: false,
      previousBranchId: activeBranchId,
      nextBranchId: activeBranchId,
    },
  };
}
```

Create `packages/tenancy/src/db-context.ts`:

```ts
import type { DatabaseAccessContext, ResolvedTenancyContext } from "./types";

export function toDatabaseAccessContext(
  context: ResolvedTenancyContext,
): DatabaseAccessContext {
  return {
    tenantId: context.targetTenantId,
    branchId: context.targetBranchId,
    subjectId: context.subjectId,
    subjectType: "internal",
    sessionId: context.sessionId,
  };
}
```

Update `packages/tenancy/src/index.ts`:

```ts
export { resolveInternalTenancyContext } from "./resolve-internal-tenancy-context";
export { toDatabaseAccessContext } from "./db-context";
```

- [ ] **Step 4: Run the tenancy package tests to verify they pass**

Run:

```powershell
pnpm --filter @vision/tenancy test -- src/errors.test.ts src/resolve-internal-tenancy-context.test.ts
```

Expected: PASS with the resolver invariants covered.

- [ ] **Step 5: Commit**

```powershell
git add packages/tenancy/src/resolve-internal-tenancy-context.ts packages/tenancy/src/resolve-internal-tenancy-context.test.ts packages/tenancy/src/db-context.ts packages/tenancy/src/index.ts
git commit -m "feat: implement internal tenancy resolution"
```

### Task 3: Add Thin DB Access-Context Helpers for Tenant-Scoped Work

**Files:**
- Create: `packages/db/src/access-context.ts`
- Create: `packages/db/src/access-context.test.ts`
- Modify: `packages/db/package.json`
- Modify: `packages/db/src/index.ts`
- Modify: `packages/observability/src/problem-details.ts`
- Modify: `packages/observability/src/problem-details.test.ts`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Write the failing DB access-context test**

Create `packages/db/src/access-context.test.ts`:

```ts
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { getDatabaseRuntimeConfig } from "./config";
import { createDatabaseClient, createDatabasePool, closeDatabasePool } from "./client";
import { withDatabaseAccessContext } from "./access-context";

const { databaseUrl } = getDatabaseRuntimeConfig(process.env);

describe("withDatabaseAccessContext", () => {
  it("applies tenant and branch settings inside the transaction", async () => {
    const pool = createDatabasePool(databaseUrl);
    const db = createDatabaseClient(pool);

    try {
      const result = await withDatabaseAccessContext(
        db,
        {
          tenantId: "tenant_1",
          branchId: "branch_1",
          subjectId: "sub_1",
          subjectType: "internal",
          sessionId: "sess_1",
        },
        async (tx) => {
          const tenantRows = await tx.execute(
            sql`select current_setting('vision.tenant_id', true) as tenant_id`,
          );
          const branchRows = await tx.execute(
            sql`select current_setting('vision.branch_id', true) as branch_id`,
          );

          return {
            tenantId: tenantRows.rows[0]?.tenant_id,
            branchId: branchRows.rows[0]?.branch_id,
          };
        },
      );

      expect(result).toEqual({
        tenantId: "tenant_1",
        branchId: "branch_1",
      });
    } finally {
      await closeDatabasePool(pool);
    }
  });

  it("fails closed when tenant context is missing", async () => {
    const pool = createDatabasePool(databaseUrl);
    const db = createDatabaseClient(pool);

    try {
      await expect(
        withDatabaseAccessContext(
          db,
          {
            tenantId: "" as unknown as string,
            branchId: null,
            subjectId: "sub_1",
            subjectType: "internal",
            sessionId: "sess_1",
          },
          async () => null,
        ),
      ).rejects.toMatchObject({
        code: "tenant_db_context_required",
      });
    } finally {
      await closeDatabasePool(pool);
    }
  });
});
```

- [ ] **Step 2: Run the DB access-context test to verify it fails**

Run:

```powershell
pnpm --filter @vision/db test -- src/access-context.test.ts
```

Expected: FAIL because `withDatabaseAccessContext` does not exist yet.

- [ ] **Step 3: Implement the DB access-context helper and extend problem codes**

Update `packages/db/package.json`:

```json
{
  "dependencies": {
    "@vision/config": "workspace:*",
    "@vision/tenancy": "workspace:*",
    "drizzle-orm": "^0.45.2",
    "pg": "^8.20.0"
  }
}
```

Create `packages/db/src/access-context.ts`:

```ts
import { sql } from "drizzle-orm";

import { TenancyError, type DatabaseAccessContext } from "@vision/tenancy";

type TransactionCapable<TTx> = {
  transaction<TResult>(callback: (tx: TTx) => Promise<TResult>): Promise<TResult>;
};

type DatabaseContextCapable = {
  execute<TResult = unknown>(query: ReturnType<typeof sql>): Promise<TResult>;
};

export async function applyDatabaseAccessContext(
  tx: DatabaseContextCapable,
  context: DatabaseAccessContext,
): Promise<void> {
  if (!context.tenantId?.trim()) {
    throw new TenancyError("tenant_db_context_required");
  }

  const branchId = context.branchId ?? "";

  await tx.execute(sql`select set_config('vision.tenant_id', ${context.tenantId}, true)`);
  await tx.execute(sql`select set_config('vision.branch_id', ${branchId}, true)`);
  await tx.execute(sql`select set_config('vision.subject_id', ${context.subjectId}, true)`);
  await tx.execute(
    sql`select set_config('vision.subject_type', ${context.subjectType}, true)`,
  );
  await tx.execute(sql`select set_config('vision.session_id', ${context.sessionId}, true)`);
}

export async function withDatabaseAccessContext<TTx extends DatabaseContextCapable, TResult>(
  db: TransactionCapable<TTx>,
  context: DatabaseAccessContext,
  callback: (tx: TTx) => Promise<TResult>,
): Promise<TResult> {
  return db.transaction(async (tx) => {
    await applyDatabaseAccessContext(tx, context);
    return callback(tx);
  });
}
```

Update `packages/db/src/index.ts`:

```ts
export {
  applyDatabaseAccessContext,
  withDatabaseAccessContext,
} from "./access-context";
```

Update `packages/observability/src/problem-details.ts`:

```ts
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
  | "unsupported_execution_surface"
  | "platform_tenant_execution_disabled"
  | "missing_active_tenant_context"
  | "missing_active_branch_context"
  | "tenant_intent_mismatch"
  | "branch_intent_mismatch"
  | "invalid_branch_switch_target"
  | "branch_not_in_active_tenant_scope"
  | "tenant_db_context_required"
  | "not_found"
  | "conflict";
```

Update `packages/observability/src/problem-details.test.ts`:

```ts
it("supports tenancy denial codes without exposing internal metadata", () => {
  const value = createProblemDetails({
    type: "https://vision.dev/problems/forbidden",
    title: "Forbidden",
    status: 403,
    code: "tenant_intent_mismatch",
    detail: "Forbidden",
  });

  expect(value.code).toBe("tenant_intent_mismatch");
  expect(value).not.toHaveProperty("debug");
});
```

- [ ] **Step 4: Run the DB and observability tests to verify they pass**

Run:

```powershell
pnpm --filter @vision/db test -- src/access-context.test.ts
pnpm --filter @vision/observability test -- src/problem-details.test.ts
```

Expected: PASS with transaction-local context application and typed problem codes in place.

- [ ] **Step 5: Refresh the lockfile**

Run:

```powershell
pnpm install
```

Expected: PASS with `pnpm-lock.yaml` updated for the new workspace dependency.

- [ ] **Step 6: Commit**

```powershell
git add packages/db/package.json packages/db/src/access-context.ts packages/db/src/access-context.test.ts packages/db/src/index.ts packages/observability/src/problem-details.ts packages/observability/src/problem-details.test.ts pnpm-lock.yaml
git commit -m "feat: add transaction-local database access context"
```

### Task 4: Add Auditable Active-Branch Switching in Authn

**Files:**
- Modify: `packages/db/src/schema/auth.ts`
- Create: `db/migrations/0003_phase_8_tenancy_context.sql`
- Create: `db/migrations/meta/0003_snapshot.json`
- Modify: `db/migrations/meta/_journal.json`
- Modify: `packages/authn/src/service.ts`
- Modify: `packages/authn/src/service.integration.test.ts`
- Modify: `packages/authn/src/index.ts`

- [ ] **Step 1: Write the failing authn branch-switch integration test**

Add to `packages/authn/src/service.integration.test.ts`:

```ts
it(
  "switches the active branch for an internal session and writes an audit event",
  async () => {
    const loginIdentifier = `branch-switch+${randomUUID()}@vision.test`;
    await seedSubject("internal", loginIdentifier, "S3cure-password!", "branch_manager");

    const login = await authn.login({
      subjectType: "internal",
      loginIdentifier,
      password: "S3cure-password!",
    });

    if (login.kind !== "session") {
      throw new Error("Expected session login result.");
    }

    createdSessionIds.push(login.session.sessionId);

    await db
      .update(authSessions)
      .set({
        activeTenantId: "tenant_1",
        activeBranchId: "branch_1",
      })
      .where(eq(authSessions.id, login.session.sessionId));

    const switched = await authn.switchActiveBranchContext({
      token: login.sessionToken,
      activeTenantId: "tenant_1",
      nextBranchId: "branch_2",
    });

    expect(switched.session.activeTenantId).toBe("tenant_1");
    expect(switched.session.activeBranchId).toBe("branch_2");

    const [event] = await db
      .select()
      .from(authAccountEvents)
      .where(eq(authAccountEvents.sessionId, login.session.sessionId))
      .orderBy(authAccountEvents.createdAt);

    expect(event?.eventType).toBe("branch_context_switched");
    expect(event?.detail).toContain("branch_1");
    expect(event?.detail).toContain("branch_2");
  },
  AUTHN_INTEGRATION_TIMEOUT_MS,
);
```

- [ ] **Step 2: Run the authn integration test to verify it fails**

Run:

```powershell
pnpm --filter @vision/authn test -- src/service.integration.test.ts
```

Expected: FAIL because the branch-switch auth event and service method do not exist yet.

- [ ] **Step 3: Add the audit event enum, migration, and authn persistence method**

Update `packages/db/src/schema/auth.ts`:

```ts
export const authAccountEventType = pgEnum("auth_account_event_type", [
  "login_success",
  "login_failure",
  "logout",
  "session_revoked",
  "session_rotated",
  "mfa_enrollment_started",
  "mfa_enrollment_completed",
  "mfa_challenge_created",
  "mfa_challenge_failed",
  "mfa_verified",
  "backup_code_used",
  "backup_codes_regenerated",
  "step_up_started",
  "step_up_verified",
  "assurance_denied",
  "branch_context_switched",
]);
```

Create `db/migrations/0003_phase_8_tenancy_context.sql`:

```sql
ALTER TYPE "auth_account_event_type" ADD VALUE IF NOT EXISTS 'branch_context_switched';
```

Update `packages/authn/src/service.ts` by adding a session mutation method:

```ts
    async switchActiveBranchContext(input: {
      token: string;
      activeTenantId: string;
      nextBranchId: string;
    }) {
      const resolution = await this.resolveSession({ token: input.token });

      if (resolution.subject.subjectType !== "internal") {
        throw new AuthnError("invalid_credentials");
      }

      if (resolution.session.activeTenantId !== input.activeTenantId) {
        throw new AuthnError("invalid_session_token");
      }

      const previousBranchId = resolution.session.activeBranchId;

      await db
        .update(authSessions)
        .set({
          activeBranchId: input.nextBranchId,
          updatedAt: now(),
        })
        .where(eq(authSessions.id, resolution.session.sessionId));

      await writeEvent({
        subjectType: resolution.subject.subjectType,
        eventType: "branch_context_switched",
        subjectId: resolution.subject.id,
        sessionId: resolution.session.sessionId,
        detail: JSON.stringify({
          tenantId: input.activeTenantId,
          previousBranchId,
          nextBranchId: input.nextBranchId,
        }),
      });

      return loadResolution(resolution.session.sessionId);
    },
```

Update `packages/authn/src/index.ts` export block only if the service type needs no extra manual export changes.

- [ ] **Step 4: Run the authn integration test to verify it passes**

Run:

```powershell
pnpm --filter @vision/authn test -- src/service.integration.test.ts
```

Expected: PASS with session mutation and audit proof.

- [ ] **Step 5: Commit**

```powershell
git add packages/db/src/schema/auth.ts db/migrations/0003_phase_8_tenancy_context.sql db/migrations/meta/0003_snapshot.json db/migrations/meta/_journal.json packages/authn/src/service.ts packages/authn/src/service.integration.test.ts packages/authn/src/index.ts
git commit -m "feat: add auditable branch context switching"
```

### Task 5: Add API Tenancy Guard Integration and Tenancy-Aware Error Mapping

**Files:**
- Create: `apps/api/src/tenancy-request.ts`
- Create: `apps/api/src/tenancy-guard.ts`
- Create: `apps/api/src/tenancy-guard.test.ts`
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/fastify-types.ts`
- Modify: `apps/api/src/http-errors.ts`
- Modify: `apps/api/src/authz-guard.ts`
- Modify: `apps/api/src/authz-guard.test.ts`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Write the failing tenancy-guard integration test**

Create `apps/api/src/tenancy-guard.test.ts`:

```ts
import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { createAuthnService, hashPassword, normalizeLoginIdentifier } from "@vision/authn";
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
import { createAuthorizationGuard } from "./authz-guard";
import { createTenancyGuard } from "./tenancy-guard";
import { buildApi } from "./server";

const { appEnv, databaseUrl } = getDatabaseRuntimeConfig(process.env);
const pool = createDatabasePool(databaseUrl);
const db = createDatabaseClient(pool);
const authn = createAuthnService(db, {
  sessionTtlMs: 60 * 60 * 1000,
  mfaEncryptionKey: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
  mfaEncryptionKeyVersion: "v1",
  totpIssuer: "Vision",
});
let createdSubjectIds: string[] = [];
let createdSessionIds: string[] = [];

function getAuthCookie(setCookie: string | string[] | undefined): string {
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!raw) throw new Error("Missing Set-Cookie header.");
  return raw.split(";")[0] ?? raw;
}

async function seedInternalSubject(loginIdentifier: string) {
  const id = `sub_${randomUUID()}`;
  createdSubjectIds.push(id);

  await db.insert(authSubjects).values({
    id,
    subjectType: "internal",
    loginIdentifier,
    normalizedLoginIdentifier: normalizeLoginIdentifier(loginIdentifier),
    passwordHash: await hashPassword("S3cure-password!"),
    internalSensitivity: "branch_manager",
  });
}

describe("createTenancyGuard", () => {
  beforeEach(() => {
    createdSubjectIds = [];
    createdSessionIds = [];
  });

  afterEach(async () => {
    if (createdSessionIds.length > 0) {
      await db.delete(authAccountEvents).where(inArray(authAccountEvents.sessionId, createdSessionIds));
      await db.delete(authSessions).where(inArray(authSessions.id, createdSessionIds));
    }

    if (createdSubjectIds.length > 0) {
      await db.delete(authAccountEvents).where(inArray(authAccountEvents.subjectId, createdSubjectIds));
      await db.delete(authSubjects).where(inArray(authSubjects.id, createdSubjectIds));
    }
  });

  afterAll(async () => {
    await closeDatabasePool(pool);
  });

  it("returns 401 before tenancy when the session is missing", async () => {
    const api = buildApi({
      runtime: {
        appEnv,
        host: "127.0.0.1",
        port: 4000,
        databaseUrl,
        mfaEncryptionKey: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
        mfaEncryptionKeyVersion: "v1",
        logLevel: "debug",
        serviceName: "vision-api",
      },
      authService: authn,
    });

    api.get(
      "/_test/erp/branches/:branchId",
      {
        preHandler: [
          createTenancyGuard({
            getRouteIntent: (request) => ({
              surface: "erp",
              requestedScope: "branch",
              branchIntent: {
                source: "path",
                rawValue: (request.params as { branchId: string }).branchId,
              },
            }),
            getAccessSnapshot: () => ({
              tenantId: "tenant_1",
              tenantRole: "branch_manager",
              allowedBranchIds: ["branch_1"],
            }),
          }),
        ],
      },
      async () => ({ ok: true }),
    );

    const response = await api.inject({
      method: "GET",
      url: "/_test/erp/branches/branch_1",
    });

    expect(response.statusCode).toBe(401);
    await api.close();
  });

  it("maps tenancy mismatch to a stable 403 code before authz", async () => {
    const api = buildApi({
      runtime: {
        appEnv,
        host: "127.0.0.1",
        port: 4000,
        databaseUrl,
        mfaEncryptionKey: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
        mfaEncryptionKeyVersion: "v1",
        logLevel: "debug",
        serviceName: "vision-api",
      },
      authService: authn,
    });
    const loginIdentifier = `tenant-mismatch+${randomUUID()}@vision.test`;
    await seedInternalSubject(loginIdentifier);

    const login = await api.inject({
      method: "POST",
      url: "/auth/internal/login",
      payload: {
        loginIdentifier,
        password: "S3cure-password!",
      },
    });
    const cookie = getAuthCookie(login.headers["set-cookie"]);
    const sessionId = cookie.replace(`${AUTH_SESSION_COOKIE_NAME}=`, "").split(".")[0] ?? "";
    createdSessionIds.push(sessionId);

    await db
      .update(authSessions)
      .set({
        activeTenantId: "tenant_1",
        activeBranchId: "branch_1",
      })
      .where(eq(authSessions.id, sessionId));

    api.get(
      "/_test/erp/tenants/:tenantId",
      {
        preHandler: [
          createTenancyGuard({
            getRouteIntent: (request) => ({
              surface: "erp",
              requestedScope: "tenant",
              tenantIntent: {
                source: "path",
                rawValue: (request.params as { tenantId: string }).tenantId,
              },
            }),
            getAccessSnapshot: () => ({
              tenantId: "tenant_1",
              tenantRole: "tenant_owner",
              allowedBranchIds: ["branch_1"],
            }),
          }),
          createAuthorizationGuard({
            resource: { family: "tenant_settings" },
            action: "read",
            getActorClaims: (_request, auth) => ({
              actorType: "internal",
              subjectId: auth.subject.id,
              currentAssurance: auth.session.assuranceLevel,
              tenantRole: "tenant_owner",
            }),
            getContextFacts: () => ({}),
          }),
        ],
      },
      async () => ({ ok: true }),
    );

    const response = await api.inject({
      method: "GET",
      url: "/_test/erp/tenants/tenant_2",
      headers: { cookie },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      code: "tenant_intent_mismatch",
    });
    expect(response.json()).not.toHaveProperty("debug");

    await api.close();
  });
});
```

- [ ] **Step 2: Run the tenancy-guard test to verify it fails**

Run:

```powershell
pnpm --filter @vision/api test -- src/tenancy-guard.test.ts
```

Expected: FAIL because the tenancy guard, request typing, and tenancy error mapping do not exist yet.

- [ ] **Step 3: Implement the tenancy guard, attach request context, and map tenancy errors**

Update `apps/api/package.json`:

```json
{
  "dependencies": {
    "@fastify/cookie": "^11.0.2",
    "@vision/authn": "workspace:*",
    "@vision/authz": "workspace:*",
    "@vision/config": "workspace:*",
    "@vision/db": "workspace:*",
    "@vision/observability": "workspace:*",
    "@vision/tenancy": "workspace:*",
    "drizzle-orm": "^0.45.2",
    "fastify": "latest",
    "fastify-plugin": "^5.0.1"
  }
}
```

Update `apps/api/src/fastify-types.ts`:

```ts
import type { ResolvedTenancyContext } from "@vision/tenancy";

declare module "fastify" {
  interface FastifyRequest {
    tenancy: ResolvedTenancyContext | null;
  }
}
```

Create `apps/api/src/tenancy-request.ts`:

```ts
import type { FastifyRequest } from "fastify";

import { requireResolvedTenancyContext } from "@vision/tenancy";

export function requireTenancyContext(request: FastifyRequest) {
  return requireResolvedTenancyContext(request.tenancy);
}
```

Create `apps/api/src/tenancy-guard.ts`:

```ts
import type { AuthResolution } from "@vision/authn";
import { extendObservabilityContext } from "@vision/observability";
import {
  resolveInternalTenancyContext,
  type ActiveTenantAccessSnapshot,
  type RawRouteIntent,
} from "@vision/tenancy";
import type { FastifyRequest } from "fastify";

import { requireAuthenticatedRequest } from "./auth-request";

export type TenancyGuardOptions = {
  getRouteIntent: (request: FastifyRequest, auth: AuthResolution) => RawRouteIntent;
  getAccessSnapshot: (
    request: FastifyRequest,
    auth: AuthResolution,
  ) => ActiveTenantAccessSnapshot | null;
};

export function createTenancyGuard(options: TenancyGuardOptions) {
  return async function tenancyGuard(request: FastifyRequest) {
    const auth = requireAuthenticatedRequest(request);
    const tenancy = resolveInternalTenancyContext({
      routeIntent: options.getRouteIntent(request, auth),
      session: {
        sessionId: auth.session.sessionId,
        subjectId: auth.subject.id,
        subjectType: "internal",
        activeTenantId: auth.session.activeTenantId,
        activeBranchId: auth.session.activeBranchId,
      },
      access: options.getAccessSnapshot(request, auth),
    });

    request.tenancy = tenancy;

    if (request.observabilityContext) {
      request.observabilityContext = extendObservabilityContext(request.observabilityContext, {
        subject: tenancy.subjectId,
        tenant: tenancy.targetTenantId,
        branch: tenancy.targetBranchId ?? undefined,
      });
      request.requestLogger = request.requestLogger?.child(request.observabilityContext) ?? null;
    }
  };
}
```

Update `apps/api/src/authz-guard.ts` so it prefers `request.tenancy`:

```ts
function deriveSessionContextFacts(request: FastifyRequest, auth: AuthResolution): AuthorizationContextFacts {
  if (request.tenancy) {
    return {
      activeTenantId: request.tenancy.activeTenantId,
      activeBranchId: request.tenancy.activeBranchId,
      targetTenantId: request.tenancy.targetTenantId,
      targetBranchId: request.tenancy.targetBranchId,
    };
  }

  return {
    activeTenantId: auth.session.activeTenantId ?? undefined,
    activeBranchId: auth.session.activeBranchId ?? undefined,
  };
}

// and later:
    const context = {
      ...deriveSessionContextFacts(request, auth),
      ...routeContext,
    };
```

Update `apps/api/src/http-errors.ts`:

```ts
import { AuthzError, isAuthzError } from "@vision/authz";
import { TenancyError, isTenancyError } from "@vision/tenancy";

function createTenancyProblem(
  error: TenancyError,
  request: FastifyRequest,
  context: ObservabilityContext,
): ApiProblemResult {
  return {
    statusCode: 403,
    problem: createProblemDetails({
      type: "https://vision.local/problems/forbidden",
      title: "Forbidden",
      status: 403,
      code: error.code,
      detail: "Forbidden",
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
  if (isTenancyError(error)) {
    return createTenancyProblem(error, request, context);
  }

  if (isAuthzError(error)) {
    return createAuthzProblem(error, request, context);
  }

  // existing branches stay unchanged
}
```

- [ ] **Step 4: Run the API tenancy and authz tests to verify they pass**

Run:

```powershell
pnpm --filter @vision/api test -- src/tenancy-guard.test.ts src/authz-guard.test.ts
```

Expected: PASS with tenancy-before-authz behavior and stable tenancy error payloads.

- [ ] **Step 5: Refresh the lockfile**

Run:

```powershell
pnpm install
```

Expected: PASS with `@vision/api` consuming `@vision/tenancy`.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/package.json apps/api/src/fastify-types.ts apps/api/src/tenancy-request.ts apps/api/src/tenancy-guard.ts apps/api/src/tenancy-guard.test.ts apps/api/src/authz-guard.ts apps/api/src/authz-guard.test.ts apps/api/src/http-errors.ts pnpm-lock.yaml
git commit -m "feat: add tenancy-aware api guards"
```

### Task 6: Document the Tenancy Execution Context Boundary

**Files:**
- Create: `docs/security/tenancy-execution-context.md`
- Create: `docs/adr/0005-transaction-local-tenancy-context.md`
- Modify: `docs/security/README.md`
- Modify: `docs/security/database-role-strategy.md`
- Modify: `docs/architecture/module-boundaries.md`

- [ ] **Step 1: Write the documentation updates**

Create `docs/security/tenancy-execution-context.md`:

```md
# Tenancy Execution Context

Phase 8 introduces trusted internal ERP tenancy execution context for Vision.

## Boundary

- `packages/tenancy` owns raw route intent, resolution invariants, and machine-readable tenancy denial codes.
- `apps/api` owns request adaptation and route-level tenancy guard integration.
- `packages/authn` persists active branch session context after successful validation and authorization.
- `packages/db` only applies trusted DB access context. It does not infer tenant policy.

## Hard Rules

- internal ERP execution only
- public tenant resolution stays separate
- platform tenant and branch execution deny by default in Phase 8
- target tenant must equal active tenant
- target branch may differ from active branch only during the dedicated branch-switch flow before persistence
```

Create `docs/adr/0005-transaction-local-tenancy-context.md`:

```md
# ADR 0005: Transaction-Local Tenancy Context

## Status

Accepted

## Decision

Vision will propagate trusted tenant, branch, subject, and session identifiers into PostgreSQL transaction-local settings before tenant-scoped work executes.

## Rationale

- prepares Phase 9 RLS without hidden repository filtering
- keeps tenant enforcement close to the database boundary
- prevents route-local tenant filtering from becoming the real security model

## Consequences

- tenant-scoped DB work must run through the DB access-context helper
- missing tenant DB context fails closed
- policy logic remains outside `packages/db`
```

Update `docs/security/README.md` list:

```md
Current implementation notes:

- [Authorization Engine](./authorization-engine.md)
- [Tenancy Execution Context](./tenancy-execution-context.md)
- [MFA And Assurance](./mfa-and-assurance.md)
- [Logging And Error Safety](./logging-and-error-safety.md)
- [Secrets Strategy](./secrets-strategy.md)
```

Update `docs/security/database-role-strategy.md`:

```md
## Transaction-Local Execution Context

Phase 8 adds transaction-local DB access-context propagation for tenant-scoped work.

- runtime code must set trusted `vision.tenant_id`
- branch, subject, subject type, and session ID may also be set transaction-locally
- the DB helper must fail closed when tenant context is missing
- this helper is infrastructure only and does not replace authz or tenancy resolution
```

Update `docs/architecture/module-boundaries.md`:

```md
Package boundaries:

- Shared packages expose reusable primitives only.
- `packages/tenancy` owns trusted ERP execution context resolution.
- `packages/db` may apply trusted DB access context, but must not become a policy engine.
- Apps must not import from other apps.
- Backend route handlers must not become business logic containers.
- Product workflows must be implemented in the proper roadmap phase.
```

- [ ] **Step 2: Review the docs for scope drift and placeholders**

Run:

```powershell
Select-String -Path docs/security/tenancy-execution-context.md,docs/adr/0005-transaction-local-tenancy-context.md -Pattern 'TODO|TBD|later'
```

Expected: No output.

- [ ] **Step 3: Commit**

```powershell
git add docs/security/tenancy-execution-context.md docs/adr/0005-transaction-local-tenancy-context.md docs/security/README.md docs/security/database-role-strategy.md docs/architecture/module-boundaries.md
git commit -m "docs: add phase 8 tenancy execution context"
```

## Self-Review

### Spec coverage

- trusted internal ERP execution context: covered by Tasks 1 and 2
- explicit request lifecycle and authz integration: covered by Task 5
- active branch persistence and auditing: covered by Task 4
- DB context propagation for Phase 9 RLS preparation: covered by Task 3
- docs and ADR updates: covered by Task 6

### Placeholder scan

- no `TBD`
- no `TODO`
- no “write tests for the above” placeholders without concrete test code

### Type consistency

- `RawRouteIntent`, `ResolvedTenancyContext`, `DatabaseAccessContext`, and `TenancyErrorCode` names are used consistently across tasks
- `switchActiveBranchContext` is the only authn session-mutation method introduced in this plan

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-22-phase-8-tenancy-execution-context.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
