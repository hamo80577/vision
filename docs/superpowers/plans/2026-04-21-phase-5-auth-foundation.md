# Phase 5 Auth Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend-only Phase 5 identity layer with database-backed sessions, Argon2id password hashing, login/logout/session resolution routes, secure cookies, and regression tests for valid, expired, revoked, rotated, and logged-out sessions.

**Architecture:** Keep the auth core in `packages/authn`, the schema and migration in `packages/db` and `db/migrations`, and the HTTP/cookie adapter in `apps/api`. The slice supports only `customer` and `internal` subjects, with no authorization, MFA, tenant enforcement, or UI.

**Tech Stack:** TypeScript, Fastify, `@fastify/cookie`, Drizzle ORM, PostgreSQL, `argon2`, Vitest

---

## File Structure

### Create

- `packages/authn/src/password.ts`
- `packages/authn/src/password.test.ts`
- `packages/authn/src/session-token.ts`
- `packages/authn/src/session-token.test.ts`
- `packages/authn/src/errors.ts`
- `packages/authn/src/service.ts`
- `packages/authn/src/service.integration.test.ts`
- `packages/db/src/schema/auth.ts`
- `db/migrations/0001_phase_5_auth_foundation.sql`
- `apps/api/src/auth-cookie.ts`
- `apps/api/src/auth-plugin.ts`
- `apps/api/src/auth-routes.test.ts`

### Modify

- `packages/authn/package.json`
- `packages/authn/src/index.ts`
- `packages/db/src/schema/index.ts`
- `packages/db/src/index.ts`
- `db/migrations/meta/_journal.json`
- `db/migrations/meta/0001_snapshot.json`
- `db/seeds/seed.ts`
- `apps/api/package.json`
- `apps/api/src/runtime.ts`
- `apps/api/src/fastify-types.ts`
- `apps/api/src/server.ts`
- `pnpm-lock.yaml`

### Responsibilities

- `packages/authn/src/password.ts`: Argon2id hashing and verification.
- `packages/authn/src/session-token.ts`: opaque session token generation, parsing, secret hashing, and secret comparison.
- `packages/authn/src/errors.ts`: auth-domain error codes for invalid credentials and invalid session states.
- `packages/authn/src/service.ts`: database-backed login, resolve, revoke, logout, and rotate flows.
- `packages/db/src/schema/auth.ts`: auth tables and enums for subjects, sessions, and auth account events.
- `apps/api/src/auth-cookie.ts`: cookie name and cookie option helpers.
- `apps/api/src/auth-plugin.ts`: Fastify cookie registration, request auth resolution, and `/auth/*` routes.
- `apps/api/src/auth-routes.test.ts`: API-level proof for customer/internal login and invalid session behavior.

### Task 1: Add Password Hashing Primitives

**Files:**
- Create: `packages/authn/src/password.test.ts`
- Create: `packages/authn/src/password.ts`
- Modify: `packages/authn/src/index.ts`
- Modify: `packages/authn/package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Write the failing password test**

```ts
import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./password";

describe("password helpers", () => {
  it("hashes passwords with argon2id and verifies the original password", async () => {
    const passwordHash = await hashPassword("S3cure-password!");

    expect(passwordHash).not.toBe("S3cure-password!");
    expect(passwordHash.startsWith("$argon2id$")).toBe(true);
    await expect(verifyPassword(passwordHash, "S3cure-password!")).resolves.toBe(true);
  });

  it("rejects the wrong password", async () => {
    const passwordHash = await hashPassword("S3cure-password!");

    await expect(verifyPassword(passwordHash, "wrong-password")).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run the password test to verify it fails**

Run:

```powershell
pnpm --filter @vision/authn test -- src/password.test.ts
```

Expected: FAIL because `./password` and its exports do not exist yet.

- [ ] **Step 3: Add the minimal password implementation**

Update `packages/authn/package.json`:

```json
{
  "name": "@vision/authn",
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
    "test": "vitest run"
  },
  "dependencies": {
    "@vision/db": "workspace:*",
    "argon2": "^0.44.0"
  }
}
```

Create `packages/authn/src/password.ts`:

```ts
import argon2 from "argon2";

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
  });
}

export async function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  try {
    return await argon2.verify(passwordHash, password);
  } catch {
    return false;
  }
}
```

Update `packages/authn/src/index.ts`:

```ts
export { hashPassword, verifyPassword } from "./password";
```

Install and refresh the lockfile:

```powershell
pnpm install
```

- [ ] **Step 4: Run the password test to verify it passes**

Run:

```powershell
pnpm --filter @vision/authn test -- src/password.test.ts
```

Expected: PASS with `2 passed`.

- [ ] **Step 5: Commit**

```powershell
git add packages/authn/package.json packages/authn/src/password.ts packages/authn/src/password.test.ts packages/authn/src/index.ts pnpm-lock.yaml
git commit -m "feat: add auth password hashing primitives"
```

### Task 2: Add Session Token Primitives

**Files:**
- Create: `packages/authn/src/session-token.test.ts`
- Create: `packages/authn/src/session-token.ts`
- Modify: `packages/authn/src/index.ts`

- [ ] **Step 1: Write the failing session-token test**

```ts
import { describe, expect, it } from "vitest";

import {
  createSessionToken,
  hashSessionSecret,
  parseSessionToken,
  verifySessionSecret,
} from "./session-token";

describe("session token helpers", () => {
  it("creates a token whose secret verifies against the stored hash", () => {
    const created = createSessionToken();
    const parsed = parseSessionToken(created.token);

    expect(parsed).toEqual({
      sessionId: created.sessionId,
      secret: created.secret,
    });
    expect(verifySessionSecret(created.secretHash, created.secret)).toBe(true);
    expect(created.secretHash).toBe(hashSessionSecret(created.secret));
  });

  it("rejects malformed tokens and wrong secrets", () => {
    expect(() => parseSessionToken("bad-token")).toThrow("Invalid session token.");

    const created = createSessionToken();
    expect(verifySessionSecret(created.secretHash, "wrong-secret")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the session-token test to verify it fails**

Run:

```powershell
pnpm --filter @vision/authn test -- src/session-token.test.ts
```

Expected: FAIL because `./session-token` does not exist yet.

- [ ] **Step 3: Add the minimal session-token implementation**

Create `packages/authn/src/session-token.ts`:

```ts
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

const SESSION_SECRET_BYTES = 32;

export type ParsedSessionToken = {
  sessionId: string;
  secret: string;
};

export type CreatedSessionToken = ParsedSessionToken & {
  token: string;
  secretHash: string;
};

export function hashSessionSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function verifySessionSecret(expectedHash: string, secret: string): boolean {
  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(hashSessionSecret(secret), "hex");

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function parseSessionToken(token: string): ParsedSessionToken {
  const [sessionId, secret, ...rest] = token.split(".");

  if (!sessionId || !secret || rest.length > 0) {
    throw new Error("Invalid session token.");
  }

  return {
    sessionId,
    secret,
  };
}

export function createSessionToken(): CreatedSessionToken {
  const sessionId = `sess_${randomUUID()}`;
  const secret = randomBytes(SESSION_SECRET_BYTES).toString("base64url");

  return {
    sessionId,
    secret,
    token: `${sessionId}.${secret}`,
    secretHash: hashSessionSecret(secret),
  };
}
```

Update `packages/authn/src/index.ts`:

```ts
export { hashPassword, verifyPassword } from "./password";
export {
  createSessionToken,
  hashSessionSecret,
  parseSessionToken,
  verifySessionSecret,
} from "./session-token";
```

- [ ] **Step 4: Run the session-token test to verify it passes**

Run:

```powershell
pnpm --filter @vision/authn test -- src/session-token.test.ts
```

Expected: PASS with `2 passed`.

- [ ] **Step 5: Commit**

```powershell
git add packages/authn/src/session-token.ts packages/authn/src/session-token.test.ts packages/authn/src/index.ts
git commit -m "feat: add auth session token helpers"
```

### Task 3: Add the Auth Schema and Database-Backed Auth Service

**Files:**
- Create: `packages/authn/src/service.integration.test.ts`
- Create: `packages/authn/src/errors.ts`
- Create: `packages/authn/src/service.ts`
- Create: `packages/db/src/schema/auth.ts`
- Modify: `packages/authn/src/index.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/src/index.ts`
- Modify: `db/seeds/seed.ts`
- Create: `db/migrations/0001_phase_5_auth_foundation.sql`
- Modify: `db/migrations/meta/_journal.json`
- Modify: `db/migrations/meta/0001_snapshot.json`

- [ ] **Step 1: Write the failing auth-service integration test**

```ts
import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  authAccountEvents,
  authSessions,
  authSubjects,
  closeDatabasePool,
  createDatabaseClient,
  createDatabasePool,
} from "@vision/db";

import {
  AuthnError,
  createAuthnService,
  hashPassword,
  normalizeLoginIdentifier,
} from "./index";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://vision_local:vision_local_password@localhost:5433/vision_local";
const pool = createDatabasePool(databaseUrl);
const db = createDatabaseClient(pool);
const authn = createAuthnService(db, {
  sessionTtlMs: 60 * 60 * 1000,
});

async function seedSubject(
  subjectType: "customer" | "internal",
  loginIdentifier: string,
  password: string,
) {
  const id = `sub_${randomUUID()}`;

  await db.insert(authSubjects).values({
    id,
    subjectType,
    loginIdentifier,
    normalizedLoginIdentifier: normalizeLoginIdentifier(loginIdentifier),
    passwordHash: await hashPassword(password),
  });

  return { id };
}

describe("createAuthnService", () => {
  beforeEach(async () => {
    await db.delete(authAccountEvents);
    await db.delete(authSessions);
    await db.delete(authSubjects);
  });

  afterAll(async () => {
    await closeDatabasePool(pool);
  });

  it("logs in an enabled subject and resolves the active session", async () => {
    const subject = await seedSubject(
      "customer",
      "Customer@Vision.test",
      "S3cure-password!",
    );

    const login = await authn.login({
      subjectType: "customer",
      loginIdentifier: "customer@vision.test",
      password: "S3cure-password!",
    });

    expect(login.subject).toMatchObject({
      id: subject.id,
      subjectType: "customer",
      loginIdentifier: "Customer@Vision.test",
    });

    const resolved = await authn.resolveSession({
      token: login.sessionToken,
    });

    expect(resolved.subject.id).toBe(subject.id);
    expect(resolved.session.sessionId).toBe(login.session.sessionId);
  });

  it("rejects invalid credentials without creating a session", async () => {
    await seedSubject("internal", "ops@vision.test", "S3cure-password!");

    await expect(
      authn.login({
        subjectType: "internal",
        loginIdentifier: "ops@vision.test",
        password: "wrong-password",
      }),
    ).rejects.toMatchObject<AuthnError>({
      code: "invalid_credentials",
    });

    await expect(db.select().from(authSessions)).resolves.toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the auth-service integration test to verify it fails**

Run:

```powershell
pnpm --filter @vision/authn test -- src/service.integration.test.ts
```

Expected: FAIL because the auth schema exports and auth service do not exist yet.

- [ ] **Step 3: Add the schema and auth service implementation**

Create `packages/db/src/schema/auth.ts`:

```ts
import {
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const authSubjectType = pgEnum("auth_subject_type", [
  "customer",
  "internal",
]);

export const authAssuranceLevel = pgEnum("auth_assurance_level", ["basic"]);

export const authAccountEventType = pgEnum("auth_account_event_type", [
  "login_success",
  "login_failure",
  "logout",
  "session_revoked",
  "session_rotated",
]);

export const authSubjects = pgTable(
  "auth_subjects",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    subjectType: authSubjectType("subject_type").notNull(),
    loginIdentifier: varchar("login_identifier", { length: 255 }).notNull(),
    normalizedLoginIdentifier: varchar("normalized_login_identifier", {
      length: 255,
    }).notNull(),
    passwordHash: text("password_hash").notNull(),
    passwordUpdatedAt: timestamp("password_updated_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    isEnabled: boolean("is_enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    bySubjectTypeAndLogin: uniqueIndex("auth_subjects_subject_type_login_key").on(
      table.subjectType,
      table.normalizedLoginIdentifier,
    ),
    normalizedLoginIdx: index("auth_subjects_normalized_login_idx").on(
      table.normalizedLoginIdentifier,
    ),
  }),
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    subjectId: varchar("subject_id", { length: 64 })
      .notNull()
      .references(() => authSubjects.id, { onDelete: "cascade" }),
    subjectType: authSubjectType("subject_type").notNull(),
    secretHash: text("secret_hash").notNull(),
    assuranceLevel: authAssuranceLevel("assurance_level").notNull().default("basic"),
    activeTenantId: varchar("active_tenant_id", { length: 64 }),
    activeBranchId: varchar("active_branch_id", { length: 64 }),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastRotatedAt: timestamp("last_rotated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revocationReason: varchar("revocation_reason", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    subjectIdx: index("auth_sessions_subject_idx").on(table.subjectId),
    activeIdx: index("auth_sessions_active_idx").on(table.expiresAt, table.revokedAt),
  }),
);

export const authAccountEvents = pgTable(
  "auth_account_events",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    subjectId: varchar("subject_id", { length: 64 }).references(() => authSubjects.id, {
      onDelete: "set null",
    }),
    sessionId: varchar("session_id", { length: 64 }).references(() => authSessions.id, {
      onDelete: "set null",
    }),
    subjectType: authSubjectType("subject_type").notNull(),
    eventType: authAccountEventType("event_type").notNull(),
    loginIdentifier: varchar("login_identifier", { length: 255 }),
    detail: text("detail"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    subjectEventIdx: index("auth_account_events_subject_idx").on(table.subjectId),
    sessionEventIdx: index("auth_account_events_session_idx").on(table.sessionId),
  }),
);
```

Create `packages/authn/src/errors.ts`:

```ts
export type AuthnErrorCode =
  | "invalid_credentials"
  | "invalid_session_token"
  | "missing_session"
  | "expired_session"
  | "revoked_session"
  | "disabled_subject";

const AUTHN_ERROR_MESSAGES: Record<AuthnErrorCode, string> = {
  invalid_credentials: "Invalid login credentials.",
  invalid_session_token: "Invalid session token.",
  missing_session: "Authentication required.",
  expired_session: "Session has expired.",
  revoked_session: "Session has been revoked.",
  disabled_subject: "Account is disabled.",
};

export class AuthnError extends Error {
  readonly code: AuthnErrorCode;

  constructor(code: AuthnErrorCode, detail = AUTHN_ERROR_MESSAGES[code]) {
    super(detail);
    this.name = "AuthnError";
    this.code = code;
  }
}

export function isAuthnError(value: unknown): value is AuthnError {
  return value instanceof AuthnError;
}
```

Create `packages/authn/src/service.ts`:

```ts
import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import {
  authAccountEvents,
  authSessions,
  authSubjects,
  type VisionDatabase,
} from "@vision/db";

import { AuthnError } from "./errors";
import { verifyPassword } from "./password";
import {
  createSessionToken,
  parseSessionToken,
  verifySessionSecret,
} from "./session-token";

export type AuthSubjectType = "customer" | "internal";
export type AuthAssuranceLevel = "basic";

export type AuthSubjectSummary = {
  id: string;
  subjectType: AuthSubjectType;
  loginIdentifier: string;
};

export type AuthSessionSummary = {
  sessionId: string;
  subjectId: string;
  subjectType: AuthSubjectType;
  assuranceLevel: AuthAssuranceLevel;
  activeTenantId: string | null;
  activeBranchId: string | null;
  expiresAt: Date;
};

export type AuthResolution = {
  subject: AuthSubjectSummary;
  session: AuthSessionSummary;
};

export type AuthnService = ReturnType<typeof createAuthnService>;

export type AuthnServiceOptions = {
  now?: () => Date;
  sessionTtlMs?: number;
};

export function normalizeLoginIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

export function createAuthnService(
  db: VisionDatabase,
  options: AuthnServiceOptions = {},
) {
  const now = options.now ?? (() => new Date());
  const sessionTtlMs = options.sessionTtlMs ?? 1000 * 60 * 60 * 12;

  async function writeEvent(input: {
    subjectType: AuthSubjectType;
    eventType:
      | "login_success"
      | "login_failure"
      | "logout"
      | "session_revoked"
      | "session_rotated";
    subjectId?: string | null;
    sessionId?: string | null;
    loginIdentifier?: string | null;
    detail?: string | null;
  }) {
    await db.insert(authAccountEvents).values({
      id: `evt_${randomUUID()}`,
      subjectId: input.subjectId ?? null,
      sessionId: input.sessionId ?? null,
      subjectType: input.subjectType,
      eventType: input.eventType,
      loginIdentifier: input.loginIdentifier ?? null,
      detail: input.detail ?? null,
      occurredAt: now(),
    });
  }

  async function getStoredSession(token: string) {
    const parsed = parseSessionToken(token);
    const [session] = await db
      .select()
      .from(authSessions)
      .where(eq(authSessions.id, parsed.sessionId))
      .limit(1);

    if (!session) {
      throw new AuthnError("missing_session");
    }

    if (!verifySessionSecret(session.secretHash, parsed.secret)) {
      throw new AuthnError("invalid_session_token");
    }

    if (session.revokedAt) {
      throw new AuthnError("revoked_session");
    }

    if (session.expiresAt.getTime() <= now().getTime()) {
      throw new AuthnError("expired_session");
    }

    return session;
  }

  async function loadResolution(sessionId: string): Promise<AuthResolution> {
    const [session] = await db
      .select()
      .from(authSessions)
      .where(eq(authSessions.id, sessionId))
      .limit(1);

    if (!session) {
      throw new AuthnError("missing_session");
    }

    const [subject] = await db
      .select()
      .from(authSubjects)
      .where(and(eq(authSubjects.id, session.subjectId), eq(authSubjects.isEnabled, true)))
      .limit(1);

    if (!subject) {
      throw new AuthnError("missing_session");
    }

    return {
      subject: {
        id: subject.id,
        subjectType: subject.subjectType,
        loginIdentifier: subject.loginIdentifier,
      },
      session: {
        sessionId: session.id,
        subjectId: session.subjectId,
        subjectType: session.subjectType,
        assuranceLevel: session.assuranceLevel,
        activeTenantId: session.activeTenantId ?? null,
        activeBranchId: session.activeBranchId ?? null,
        expiresAt: session.expiresAt,
      },
    };
  }

  return {
    async login(input: {
      subjectType: AuthSubjectType;
      loginIdentifier: string;
      password: string;
    }) {
      const normalizedLoginIdentifier = normalizeLoginIdentifier(input.loginIdentifier);
      const [subject] = await db
        .select()
        .from(authSubjects)
        .where(
          and(
            eq(authSubjects.subjectType, input.subjectType),
            eq(authSubjects.normalizedLoginIdentifier, normalizedLoginIdentifier),
          ),
        )
        .limit(1);

      if (!subject || !(await verifyPassword(subject.passwordHash, input.password))) {
        await writeEvent({
          subjectType: input.subjectType,
          eventType: "login_failure",
          loginIdentifier: input.loginIdentifier,
          subjectId: subject?.id ?? null,
          detail: "invalid_credentials",
        });
        throw new AuthnError("invalid_credentials");
      }

      if (!subject.isEnabled) {
        throw new AuthnError("disabled_subject");
      }

      const created = createSessionToken();
      const issuedAt = now();
      const expiresAt = new Date(issuedAt.getTime() + sessionTtlMs);

      await db.insert(authSessions).values({
        id: created.sessionId,
        subjectId: subject.id,
        subjectType: subject.subjectType,
        secretHash: created.secretHash,
        assuranceLevel: "basic",
        issuedAt,
        expiresAt,
        lastRotatedAt: issuedAt,
      });

      await writeEvent({
        subjectType: subject.subjectType,
        eventType: "login_success",
        subjectId: subject.id,
        sessionId: created.sessionId,
        loginIdentifier: subject.loginIdentifier,
      });

      const resolution = await loadResolution(created.sessionId);

      return {
        ...resolution,
        sessionToken: created.token,
      };
    },

    async resolveSession(input: { token: string }) {
      const session = await getStoredSession(input.token);
      return loadResolution(session.id);
    },

    async revokeSession(input: {
      sessionId: string;
      subjectType: AuthSubjectType;
      reason: string;
    }) {
      await db
        .update(authSessions)
        .set({
          revokedAt: now(),
          revocationReason: input.reason,
          updatedAt: now(),
        })
        .where(eq(authSessions.id, input.sessionId));

      await writeEvent({
        subjectType: input.subjectType,
        eventType: "session_revoked",
        sessionId: input.sessionId,
        detail: input.reason,
      });
    },

    async logout(input: { token: string }) {
      const resolution = await this.resolveSession(input);

      await this.revokeSession({
        sessionId: resolution.session.sessionId,
        subjectType: resolution.subject.subjectType,
        reason: "logout",
      });

      await writeEvent({
        subjectType: resolution.subject.subjectType,
        eventType: "logout",
        subjectId: resolution.subject.id,
        sessionId: resolution.session.sessionId,
        loginIdentifier: resolution.subject.loginIdentifier,
      });
    },

    async rotateSession(input: { token: string }) {
      const resolution = await this.resolveSession(input);
      const nextToken = createSessionToken();

      await db
        .update(authSessions)
        .set({
          secretHash: nextToken.secretHash,
          lastRotatedAt: now(),
          updatedAt: now(),
        })
        .where(eq(authSessions.id, resolution.session.sessionId));

      await writeEvent({
        subjectType: resolution.subject.subjectType,
        eventType: "session_rotated",
        subjectId: resolution.subject.id,
        sessionId: resolution.session.sessionId,
      });

      return {
        ...(await loadResolution(resolution.session.sessionId)),
        sessionToken: `${resolution.session.sessionId}.${nextToken.secret}`,
      };
    },
  };
}
```

Update `packages/db/src/schema/index.ts`:

```ts
export { appMetadata } from "./app-metadata";
export {
  authAccountEvents,
  authAccountEventType,
  authAssuranceLevel,
  authSessions,
  authSubjects,
  authSubjectType,
} from "./auth";
```

Update `packages/db/src/index.ts`:

```ts
export {
  closeDatabasePool,
  createDatabaseClient,
  createDatabasePool,
  createRuntimeDatabase,
  type DatabasePool,
  type VisionDatabase,
} from "./client";
export {
  getDatabaseAdminConfig,
  getDatabaseRuntimeConfig,
  type DatabaseAdminConfig,
  type DatabaseRuntimeConfig,
} from "./config";
export { checkDatabaseHealth } from "./health";
export {
  appMetadata,
  authAccountEvents,
  authSessions,
  authSubjects,
} from "./schema";
export { withDatabaseTransaction } from "./transactions";
```

Update `packages/authn/src/index.ts`:

```ts
export { AuthnError, isAuthnError, type AuthnErrorCode } from "./errors";
export { hashPassword, verifyPassword } from "./password";
export {
  createAuthnService,
  normalizeLoginIdentifier,
  type AuthResolution,
  type AuthSessionSummary,
  type AuthSubjectSummary,
  type AuthSubjectType,
  type AuthnService,
} from "./service";
export {
  createSessionToken,
  hashSessionSecret,
  parseSessionToken,
  verifySessionSecret,
} from "./session-token";
```

Update `db/seeds/seed.ts`:

```ts
await tx.insert(appMetadata).values([
  {
    key: "schema_baseline",
    value: "phase_5",
  },
  {
    key: "seed_version",
    value: "2026-04-21-phase-5",
  },
]);
```

- [ ] **Step 4: Generate the migration and reset the local database**

Run:

```powershell
$env:APP_ENV='local'
$env:DATABASE_URL='postgresql://vision_local:vision_local_password@localhost:5433/vision_local'
pnpm db:generate
```

Expected: a new `db/migrations/0001_phase_5_auth_foundation.sql` and updated `db/migrations/meta` files.

Then run:

```powershell
$env:APP_ENV='local'
$env:DATABASE_URL='postgresql://vision_local:vision_local_password@localhost:5433/vision_local'
$env:DATABASE_ADMIN_URL='postgresql://vision_local:vision_local_password@localhost:5433/postgres'
$env:DATABASE_ADMIN_TARGET_DB='vision_local'
pnpm db:reset
```

Expected: database recreated, migration applied, and seed output printed.

- [ ] **Step 5: Run the auth-service integration test to verify it passes**

Run:

```powershell
$env:DATABASE_URL='postgresql://vision_local:vision_local_password@localhost:5433/vision_local'
pnpm --filter @vision/authn test -- src/service.integration.test.ts
```

Expected: PASS with `2 passed`.

- [ ] **Step 6: Commit**

```powershell
git add packages/db/src/schema/auth.ts packages/db/src/schema/index.ts packages/db/src/index.ts packages/authn/src/errors.ts packages/authn/src/service.ts packages/authn/src/service.integration.test.ts packages/authn/src/index.ts db/migrations db/seeds/seed.ts
git commit -m "feat: add database-backed auth service"
```

### Task 4: Add API Cookie Handling, Auth Middleware, and Auth Routes

**Files:**
- Create: `apps/api/src/auth-routes.test.ts`
- Create: `apps/api/src/auth-cookie.ts`
- Create: `apps/api/src/auth-plugin.ts`
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/runtime.ts`
- Modify: `apps/api/src/fastify-types.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Write the failing auth-routes integration test**

```ts
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  authAccountEvents,
  authSessions,
  authSubjects,
  closeDatabasePool,
  createDatabaseClient,
  createDatabasePool,
} from "@vision/db";
import {
  createAuthnService,
  hashPassword,
  normalizeLoginIdentifier,
} from "@vision/authn";

import { AUTH_SESSION_COOKIE_NAME } from "./auth-cookie";
import { buildApi } from "./server";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://vision_local:vision_local_password@localhost:5433/vision_local";

const runtime = {
  appEnv: "local",
  host: "127.0.0.1",
  port: 4000,
  databaseUrl,
  logLevel: "debug",
  serviceName: "vision-api",
} as const;

const pool = createDatabasePool(databaseUrl);
const db = createDatabaseClient(pool);
const authn = createAuthnService(db, {
  sessionTtlMs: 60 * 60 * 1000,
});

function getAuthCookie(setCookie: string | string[] | undefined): string {
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;

  if (!raw) {
    throw new Error("Missing Set-Cookie header.");
  }

  return raw.split(";")[0] ?? raw;
}

async function seedSubject(
  subjectType: "customer" | "internal",
  loginIdentifier: string,
  password: string,
) {
  await db.insert(authSubjects).values({
    id: `sub_${randomUUID()}`,
    subjectType,
    loginIdentifier,
    normalizedLoginIdentifier: normalizeLoginIdentifier(loginIdentifier),
    passwordHash: await hashPassword(password),
  });
}

describe("auth routes", () => {
  beforeEach(async () => {
    await db.delete(authAccountEvents);
    await db.delete(authSessions);
    await db.delete(authSubjects);
  });

  afterAll(async () => {
    await closeDatabasePool(pool);
  });

  it("logs in a customer and resolves the current session", async () => {
    const api = buildApi({ runtime, authService: authn });
    await seedSubject("customer", "customer@vision.test", "S3cure-password!");

    const login = await api.inject({
      method: "POST",
      url: "/auth/customer/login",
      payload: {
        loginIdentifier: "customer@vision.test",
        password: "S3cure-password!",
      },
    });

    expect(login.statusCode).toBe(200);
    expect(login.headers["set-cookie"]).toEqual(expect.any(String));
    expect(login.headers["set-cookie"]).toContain("HttpOnly");
    expect(login.headers["set-cookie"]).toContain("SameSite=Lax");
    expect(login.headers["set-cookie"]).toContain("Path=/");
    expect(login.headers["set-cookie"]).not.toContain("Secure");

    const session = await api.inject({
      method: "GET",
      url: "/auth/session",
      headers: {
        cookie: getAuthCookie(login.headers["set-cookie"]),
      },
    });

    expect(session.statusCode).toBe(200);
    expect(session.json()).toMatchObject({
      subject: {
        subjectType: "customer",
        loginIdentifier: "customer@vision.test",
      },
    });

    await api.close();
  });

  it("logs in an internal subject and resolves the current session", async () => {
    const api = buildApi({ runtime, authService: authn });
    await seedSubject("internal", "ops@vision.test", "S3cure-password!");

    const login = await api.inject({
      method: "POST",
      url: "/auth/internal/login",
      payload: {
        loginIdentifier: "ops@vision.test",
        password: "S3cure-password!",
      },
    });

    const session = await api.inject({
      method: "GET",
      url: "/auth/session",
      headers: {
        cookie: getAuthCookie(login.headers["set-cookie"]),
      },
    });

    expect(session.statusCode).toBe(200);
    expect(session.json()).toMatchObject({
      subject: {
        subjectType: "internal",
      },
    });

    await api.close();
  });

  it("rejects expired sessions", async () => {
    const api = buildApi({ runtime, authService: authn });
    await seedSubject("customer", "expired@vision.test", "S3cure-password!");

    const login = await api.inject({
      method: "POST",
      url: "/auth/customer/login",
      payload: {
        loginIdentifier: "expired@vision.test",
        password: "S3cure-password!",
      },
    });
    const cookie = getAuthCookie(login.headers["set-cookie"]);
    const sessionId = cookie.replace(`${AUTH_SESSION_COOKIE_NAME}=`, "").split(".")[0];

    await db
      .update(authSessions)
      .set({
        expiresAt: new Date("2026-01-01T00:00:00.000Z"),
      })
      .where(eq(authSessions.id, sessionId));

    const response = await api.inject({
      method: "GET",
      url: "/auth/session",
      headers: {
        cookie,
      },
    });

    expect(response.statusCode).toBe(401);

    await api.close();
  });

  it("rejects revoked sessions and clears the cookie", async () => {
    const api = buildApi({ runtime, authService: authn });
    await seedSubject("internal", "revoked@vision.test", "S3cure-password!");

    const login = await api.inject({
      method: "POST",
      url: "/auth/internal/login",
      payload: {
        loginIdentifier: "revoked@vision.test",
        password: "S3cure-password!",
      },
    });

    const cookie = getAuthCookie(login.headers["set-cookie"]);
    await authn.logout({
      token: cookie.replace(`${AUTH_SESSION_COOKIE_NAME}=`, ""),
    });

    const response = await api.inject({
      method: "GET",
      url: "/auth/session",
      headers: {
        cookie,
      },
    });

    expect(response.statusCode).toBe(401);

    await api.close();
  });

  it("revokes the current session on logout and prevents reuse", async () => {
    const api = buildApi({ runtime, authService: authn });
    await seedSubject("customer", "logout@vision.test", "S3cure-password!");

    const login = await api.inject({
      method: "POST",
      url: "/auth/customer/login",
      payload: {
        loginIdentifier: "logout@vision.test",
        password: "S3cure-password!",
      },
    });

    const cookie = getAuthCookie(login.headers["set-cookie"]);
    const logout = await api.inject({
      method: "POST",
      url: "/auth/logout",
      headers: {
        cookie,
      },
    });

    expect(logout.statusCode).toBe(204);
    expect(logout.headers["set-cookie"]).toContain(`${AUTH_SESSION_COOKIE_NAME}=`);

    const reused = await api.inject({
      method: "GET",
      url: "/auth/session",
      headers: {
        cookie,
      },
    });

    expect(reused.statusCode).toBe(401);

    await api.close();
  });

  it("invalidates the previous token after rotation", async () => {
    const api = buildApi({ runtime, authService: authn });
    await seedSubject("internal", "rotate@vision.test", "S3cure-password!");

    const login = await api.inject({
      method: "POST",
      url: "/auth/internal/login",
      payload: {
        loginIdentifier: "rotate@vision.test",
        password: "S3cure-password!",
      },
    });

    const originalCookie = getAuthCookie(login.headers["set-cookie"]);
    const rotated = await authn.rotateSession({
      token: originalCookie.replace(`${AUTH_SESSION_COOKIE_NAME}=`, ""),
    });

    const oldTokenResponse = await api.inject({
      method: "GET",
      url: "/auth/session",
      headers: {
        cookie: originalCookie,
      },
    });

    const newTokenResponse = await api.inject({
      method: "GET",
      url: "/auth/session",
      headers: {
        cookie: `${AUTH_SESSION_COOKIE_NAME}=${rotated.sessionToken}`,
      },
    });

    expect(oldTokenResponse.statusCode).toBe(401);
    expect(newTokenResponse.statusCode).toBe(200);

    await api.close();
  });
});
```

- [ ] **Step 2: Run the auth-routes integration test to verify it fails**

Run:

```powershell
$env:DATABASE_URL='postgresql://vision_local:vision_local_password@localhost:5433/vision_local'
pnpm --filter @vision/api test -- src/auth-routes.test.ts
```

Expected: FAIL because the auth cookie helper, auth plugin, runtime database URL, and routes do not exist yet.

- [ ] **Step 3: Add the API auth adapter**

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
    "@vision/config": "workspace:*",
    "@vision/db": "workspace:*",
    "@vision/observability": "workspace:*",
    "fastify": "latest"
  }
}
```

Update `apps/api/src/runtime.ts`:

```ts
import type { AppEnvironment, LogLevel } from "@vision/config";
import { parseApiConfig } from "@vision/config";

export type ApiRuntimeConfig = {
  appEnv: AppEnvironment;
  host: string;
  port: number;
  databaseUrl: string;
  logLevel: LogLevel;
  serviceName: "vision-api";
};

export type ApiListenOptions = Pick<ApiRuntimeConfig, "host" | "port">;

export function getApiRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): ApiRuntimeConfig {
  const config = parseApiConfig(env);

  return {
    appEnv: config.appEnv,
    host: config.host,
    port: config.port,
    databaseUrl: config.databaseUrl,
    logLevel: config.logLevel,
    serviceName: "vision-api",
  };
}

export function getApiListenOptions(
  env: NodeJS.ProcessEnv = process.env,
): ApiListenOptions {
  const runtime = getApiRuntimeConfig(env);

  return {
    host: runtime.host,
    port: runtime.port,
  };
}
```

Create `apps/api/src/auth-cookie.ts`:

```ts
import type { FastifyReply, FastifyRequest } from "fastify";

import type { AppEnvironment } from "@vision/config";

export const AUTH_SESSION_COOKIE_NAME = "vision_auth_session";

function shouldUseSecureCookies(appEnv: AppEnvironment): boolean {
  return appEnv === "staging" || appEnv === "production";
}

function getCookieOptions(appEnv: AppEnvironment, expiresAt?: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: shouldUseSecureCookies(appEnv),
    expires: expiresAt,
  };
}

export function readAuthCookie(request: FastifyRequest): string | undefined {
  return request.cookies[AUTH_SESSION_COOKIE_NAME];
}

export function setAuthCookie(
  reply: FastifyReply,
  appEnv: AppEnvironment,
  token: string,
  expiresAt: Date,
): void {
  reply.setCookie(AUTH_SESSION_COOKIE_NAME, token, getCookieOptions(appEnv, expiresAt));
}

export function clearAuthCookie(reply: FastifyReply, appEnv: AppEnvironment): void {
  reply.clearCookie(AUTH_SESSION_COOKIE_NAME, getCookieOptions(appEnv));
}
```

Create `apps/api/src/auth-plugin.ts`:

```ts
import fastifyCookie from "@fastify/cookie";
import type { FastifyPluginAsync } from "fastify";

import {
  AuthnError,
  createAuthnService,
  isAuthnError,
  type AuthResolution,
  type AuthnService,
} from "@vision/authn";
import {
  closeDatabasePool,
  createRuntimeDatabase,
} from "@vision/db";
import {
  ProblemError,
  getProblemDefinitionForStatus,
} from "@vision/observability";

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

function unauthenticated(detail: string): ProblemError {
  return new ProblemError({
    ...getProblemDefinitionForStatus(401),
    detail,
  });
}

function getAuthFailureDetail(code: AuthnError["code"] | null): string {
  switch (code) {
    case "expired_session":
      return "Session has expired.";
    case "revoked_session":
      return "Session has been revoked.";
    default:
      return "Authentication required.";
  }
}

function requireAuth(request: { auth: AuthResolution | null; authFailure: AuthnError["code"] | null }) {
  if (request.auth) {
    return request.auth;
  }

  throw unauthenticated(getAuthFailureDetail(request.authFailure));
}

export const authPlugin: FastifyPluginAsync<AuthPluginOptions> = async (
  api,
  options,
) => {
  await api.register(fastifyCookie);

  const database =
    options.authService === undefined
      ? createRuntimeDatabase({
          appEnv: options.runtime.appEnv,
          databaseUrl: options.runtime.databaseUrl,
        })
      : null;

  const authService =
    options.authService ??
    createAuthnService(
      (() => {
        if (!database) {
          throw new Error("Expected runtime database when authService is not provided.");
        }

        return database.db;
      })(),
    );

  if (database) {
    api.addHook("onClose", async () => {
      await closeDatabasePool(database.pool);
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
    const result = await authService.login({
      subjectType: "customer",
      loginIdentifier: (request.body as { loginIdentifier: string }).loginIdentifier,
      password: (request.body as { password: string }).password,
    });

    setAuthCookie(reply, options.runtime.appEnv, result.sessionToken, result.session.expiresAt);

    return {
      subject: result.subject,
      session: result.session,
    };
  });

  api.post("/auth/internal/login", { schema: loginSchema }, async (request, reply) => {
    const result = await authService.login({
      subjectType: "internal",
      loginIdentifier: (request.body as { loginIdentifier: string }).loginIdentifier,
      password: (request.body as { password: string }).password,
    });

    setAuthCookie(reply, options.runtime.appEnv, result.sessionToken, result.session.expiresAt);

    return {
      subject: result.subject,
      session: result.session,
    };
  });

  api.get("/auth/session", async (request, reply) => {
    try {
      return requireAuth(request);
    } catch (error) {
      clearAuthCookie(reply, options.runtime.appEnv);
      throw error;
    }
  });

  api.post("/auth/logout", async (request, reply) => {
    const token = readAuthCookie(request);

    if (!token) {
      clearAuthCookie(reply, options.runtime.appEnv);
      throw unauthenticated("Authentication required.");
    }

    try {
      await authService.logout({ token });
      clearAuthCookie(reply, options.runtime.appEnv);
      reply.code(204).send();
    } catch (error) {
      clearAuthCookie(reply, options.runtime.appEnv);

      if (isAuthnError(error)) {
        throw unauthenticated(getAuthFailureDetail(error.code));
      }

      throw error;
    }
  });
};
```

Update `apps/api/src/fastify-types.ts`:

```ts
import type {
  ActiveTrace,
  ObservabilityContext,
  VisionLogger,
} from "@vision/observability";
import type { AuthResolution, AuthnErrorCode } from "@vision/authn";

declare module "fastify" {
  interface FastifyRequest {
    activeTrace: ActiveTrace | null;
    observabilityContext: ObservabilityContext | null;
    requestLogger: VisionLogger | null;
    requestStartedAt: number | null;
    auth: AuthResolution | null;
    authFailure: AuthnErrorCode | null;
  }
}

export {};
```

Update `apps/api/src/server.ts` to register the auth plugin:

```ts
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";

import {
  createLogger,
  createNoopTracer,
  extendObservabilityContext,
  sanitizeProblemInstance,
  type ObservabilityTracer,
  type VisionLogger,
} from "@vision/observability";
import type { AuthnService } from "@vision/authn";

import "./fastify-types";
import { authPlugin } from "./auth-plugin";
import { mapApiErrorToProblem } from "./http-errors";
import { createApiRequestContext } from "./request-context";
import { getApiRuntimeConfig, type ApiRuntimeConfig } from "./runtime";

export type ApiBuildDependencies = {
  runtime: ApiRuntimeConfig;
  logger: VisionLogger;
  tracer: ObservabilityTracer;
  authService?: AuthnService;
};

export function buildApi(
  overrides: Partial<ApiBuildDependencies> = {},
): FastifyInstance {
  const runtime = overrides.runtime ?? getApiRuntimeConfig();
  const rootLogger =
    overrides.logger ??
    createLogger({
      service: runtime.serviceName,
      environment: runtime.appEnv,
      level: runtime.logLevel,
    });
  const tracer = overrides.tracer ?? createNoopTracer();
  const api = Fastify({
    logger: false,
  });

  api.decorateRequest("activeTrace", null);
  api.decorateRequest("observabilityContext", null);
  api.decorateRequest("requestLogger", null);
  api.decorateRequest("requestStartedAt", null);

  // Keep the existing request-context and error hooks in place here.

  api.get("/health", async () => ({
    service: runtime.serviceName,
    status: "ok",
  }));

  api.register(authPlugin, {
    runtime,
    authService: overrides.authService,
  });

  return api;
}
```

Install and refresh the lockfile:

```powershell
pnpm install
```

- [ ] **Step 4: Run the auth-routes test to verify it passes**

Run:

```powershell
$env:DATABASE_URL='postgresql://vision_local:vision_local_password@localhost:5433/vision_local'
pnpm --filter @vision/api test -- src/auth-routes.test.ts
```

Expected: PASS with `6 passed`.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/package.json apps/api/src/runtime.ts apps/api/src/fastify-types.ts apps/api/src/auth-cookie.ts apps/api/src/auth-plugin.ts apps/api/src/auth-routes.test.ts apps/api/src/server.ts pnpm-lock.yaml
git commit -m "feat: add auth API routes and middleware"
```

### Task 5: Run Full Verification and Decide Whether Phase 5 Is Closed

**Files:**
- No code changes required unless verification reveals a gap.

- [ ] **Step 1: Start PostgreSQL**

Run:

```powershell
docker compose up -d postgres
```

Expected: the `vision-postgres` container is running and healthy.

- [ ] **Step 2: Reset the local database onto the new migration**

Run:

```powershell
$env:APP_ENV='local'
$env:DATABASE_URL='postgresql://vision_local:vision_local_password@localhost:5433/vision_local'
$env:DATABASE_ADMIN_URL='postgresql://vision_local:vision_local_password@localhost:5433/postgres'
$env:DATABASE_ADMIN_TARGET_DB='vision_local'
pnpm db:reset
```

Expected: database recreated, migration applied, seed completed successfully.

- [ ] **Step 3: Run the targeted auth tests**

Run:

```powershell
$env:DATABASE_URL='postgresql://vision_local:vision_local_password@localhost:5433/vision_local'
pnpm --filter @vision/authn test -- src/password.test.ts src/session-token.test.ts src/service.integration.test.ts
pnpm --filter @vision/api test -- src/auth-routes.test.ts
```

Expected: all targeted auth tests pass with `0 failed`.

- [ ] **Step 4: Run repo-wide verification**

Run:

```powershell
$env:APP_ENV='local'
$env:DATABASE_URL='postgresql://vision_local:vision_local_password@localhost:5433/vision_local'
$env:DATABASE_ADMIN_URL='postgresql://vision_local:vision_local_password@localhost:5433/postgres'
$env:DATABASE_ADMIN_TARGET_DB='vision_local'
$env:API_HOST='0.0.0.0'
$env:API_PORT='4000'
$env:LOG_LEVEL='info'
pnpm test
pnpm lint
pnpm typecheck
```

Expected: all three commands exit `0`.

- [ ] **Step 5: Evaluate the roadmap exit criteria explicitly**

Use this checklist and report the result line-by-line:

```md
- [ ] session-backed login works
- [ ] revoked session fails
- [ ] expired session fails
- [ ] secure cookie settings are enforced where applicable
- [ ] identity is real, stateful, and revocable
- [ ] the system can reliably distinguish subject types
- [ ] customer auth primitives exist
- [ ] internal auth primitives exist
- [ ] login/logout flows exist
- [ ] session rotation behavior exists
- [ ] password reset placeholder strategy is documented in the Phase 5 design spec
```

Decision rule:

- If every item above is true after fresh verification, report that Phase 5 is closed.
- If any item is false, report that Phase 5 is not closed and list the exact remaining gap.
