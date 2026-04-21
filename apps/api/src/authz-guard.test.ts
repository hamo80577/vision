import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createAuthnService,
  hashPassword,
  normalizeLoginIdentifier,
  type AuthResolution
} from "@vision/authn";
import {
  authAccountEvents,
  authSessions,
  authSubjects,
  closeDatabasePool,
  createDatabaseClient,
  createDatabasePool,
  getDatabaseRuntimeConfig
} from "@vision/db";

import { AUTH_SESSION_COOKIE_NAME } from "./auth-cookie";
import {
  createAuthorizationGuard,
  type AuthorizationGuardOptions
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
  serviceName: "vision-api"
} as const;

const pool = createDatabasePool(databaseUrl);
const db = createDatabaseClient(pool);
const authn = createAuthnService(db, {
  now: () => new Date(FIXED_TEST_TIME),
  sessionTtlMs: 60 * 60 * 1000,
  mfaEncryptionKey: MFA_ENCRYPTION_KEY,
  mfaEncryptionKeyVersion: "v1",
  totpIssuer: "Vision"
});
let createdSubjectIds: string[] = [];
let createdSessionIds: string[] = [];

type TestInternalSensitivity =
  | "none"
  | "platform_admin"
  | "tenant_owner"
  | "branch_manager";

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
  internalSensitivity: TestInternalSensitivity | null = null
) {
  const id = `sub_${randomUUID()}`;
  createdSubjectIds.push(id);

  await db.insert(authSubjects).values({
    id,
    subjectType,
    loginIdentifier,
    normalizedLoginIdentifier: normalizeLoginIdentifier(loginIdentifier),
    passwordHash: await hashPassword(password),
    internalSensitivity,
    isEnabled: true
  });
}

function registerGuardedRoute(
  api: FastifyInstance,
  input: AuthorizationGuardOptions & {
    method: "GET" | "POST";
    url: string;
  }
) {
  api.route({
    method: input.method,
    url: input.url,
    preHandler: createAuthorizationGuard(input),
    handler: async () => ({ ok: true })
  });
}

function createMockAuthResolution(
  overrides: {
    subject?: Partial<AuthResolution["subject"]>;
    session?: Partial<AuthResolution["session"]>;
  } = {}
): AuthResolution {
  return {
    subject: {
      id: "sub_test",
      subjectType: "internal",
      loginIdentifier: "test@vision.local",
      internalSensitivity: null,
      ...overrides.subject
    },
    session: {
      sessionId: "sess_test",
      subjectId: "sub_test",
      subjectType: "internal",
      assuranceLevel: "mfa_verified",
      assuranceUpdatedAt: FIXED_TEST_TIME,
      activeTenantId: null,
      activeBranchId: null,
      expiresAt: new Date(FIXED_TEST_TIME.getTime() + 60 * 60 * 1000),
      ...overrides.session
    }
  };
}

async function loginAndGetCookie(
  api: FastifyInstance,
  subjectType: "customer" | "internal",
  loginIdentifier: string,
  password: string
) {
  const response = await api.inject({
    method: "POST",
    url: subjectType === "customer" ? "/auth/customer/login" : "/auth/internal/login",
    payload: {
      loginIdentifier,
      password
    }
  });
  const cookie = getAuthCookie(response.headers["set-cookie"]);
  const sessionId = extractSessionId(cookie);
  createdSessionIds.push(sessionId);

  return {
    cookie,
    sessionId
  };
}

async function setSessionScope(
  sessionId: string,
  input: {
    activeTenantId?: string | null;
    activeBranchId?: string | null;
  }
) {
  await db
    .update(authSessions)
    .set({
      activeTenantId: input.activeTenantId ?? null,
      activeBranchId: input.activeBranchId ?? null
    })
    .where(eq(authSessions.id, sessionId));
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

  it("keeps session activeTenantId authoritative over route facts", async () => {
    const guard = createAuthorizationGuard({
      resource: { family: "tenant_settings" },
      action: "read",
      getActorClaims: (_request, auth) => ({
        actorType: "internal",
        subjectId: auth.subject.id,
        currentAssurance: auth.session.assuranceLevel,
        tenantRole: "tenant_owner"
      }),
      getContextFacts: () =>
        ({
          activeTenantId: "tenant_route",
          targetTenantId: "tenant_route"
        }) as unknown as ReturnType<
          Exclude<AuthorizationGuardOptions["getContextFacts"], undefined>
        >
    });

    await expect(
      guard({
        auth: createMockAuthResolution({
          session: {
            activeTenantId: "tenant_session"
          }
        }),
        authFailure: null
      } as FastifyRequest)
    ).rejects.toMatchObject({
      code: "insufficient_scope"
    });
  });

  it("keeps session activeBranchId authoritative over route facts", async () => {
    const guard = createAuthorizationGuard({
      resource: { family: "branch_operations" },
      action: "read",
      getActorClaims: (_request, auth) => ({
        actorType: "internal",
        subjectId: auth.subject.id,
        currentAssurance: auth.session.assuranceLevel,
        tenantRole: "branch_manager",
        assignedBranchIds: ["branch_route"]
      }),
      getContextFacts: () =>
        ({
          activeBranchId: "branch_route",
          targetTenantId: "tenant_1",
          targetBranchId: "branch_route"
        }) as unknown as ReturnType<
          Exclude<AuthorizationGuardOptions["getContextFacts"], undefined>
        >
    });

    await expect(
      guard({
        auth: createMockAuthResolution({
          session: {
            activeTenantId: "tenant_1",
            activeBranchId: "branch_session"
          }
        }),
        authFailure: null
      } as FastifyRequest)
    ).rejects.toMatchObject({
      code: "insufficient_scope"
    });
  });

  it("does not derive privileged authz claims from internal sensitivity", async () => {
    const guard = createAuthorizationGuard({
      resource: { family: "platform_tenant_management" },
      action: "read",
      getContextFacts: () => ({
        targetTenantId: "tenant_1"
      })
    });

    await expect(
      guard({
        auth: createMockAuthResolution({
          subject: {
            internalSensitivity: "platform_admin"
          }
        }),
        authFailure: null
      } as FastifyRequest)
    ).rejects.toMatchObject({
      code: "insufficient_scope"
    });
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
          tenantRole: "tenant_owner"
        }),
        getContextFacts: (request) => {
          const { tenantId } = request.params as { tenantId: string };
          return {
            targetTenantId: tenantId
          };
        }
      });

      const response = await api.inject({
        method: "GET",
        url: "/_test/tenant-settings/tenant_1"
      });

      expect(response.statusCode).toBe(401);

      await api.close();
    },
    AUTHZ_GUARD_TEST_TIMEOUT_MS
  );

  it(
    "returns 403 insufficient_scope without leaking debug metadata",
    async () => {
      const api = buildApi({ runtime, authService: authn });
      registerGuardedRoute(api, {
        method: "GET",
        url: "/_test/platform-tenants/:tenantId",
        resource: { family: "platform_tenant_management" },
        action: "read",
        getContextFacts: (request) => {
          const { tenantId } = request.params as { tenantId: string };
          return {
            targetTenantId: tenantId
          };
        }
      });

      const loginIdentifier = `internal+${randomUUID()}@vision.test`;
      await seedSubject("internal", loginIdentifier, "S3cure-password!", "none");
      const { cookie } = await loginAndGetCookie(
        api,
        "internal",
        loginIdentifier,
        "S3cure-password!"
      );

      const response = await api.inject({
        method: "GET",
        url: "/_test/platform-tenants/tenant_1",
        headers: {
          cookie
        }
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        code: "insufficient_scope"
      });
      expect(response.json()).not.toHaveProperty("debug");
      expect(response.json()).not.toHaveProperty("denialReason");

      await api.close();
    },
    AUTHZ_GUARD_TEST_TIMEOUT_MS
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
          assignedBranchIds: ["branch_1"]
        }),
        getContextFacts: () => ({
          targetTenantId: "tenant_1"
        })
      });

      const loginIdentifier = `branch+${randomUUID()}@vision.test`;
      await seedSubject("internal", loginIdentifier, "S3cure-password!", "none");
      const { cookie, sessionId } = await loginAndGetCookie(
        api,
        "internal",
        loginIdentifier,
        "S3cure-password!"
      );
      await setSessionScope(sessionId, {
        activeTenantId: "tenant_1"
      });

      const response = await api.inject({
        method: "GET",
        url: "/_test/branches",
        headers: {
          cookie
        }
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        code: "missing_context"
      });
      expect(response.json()).not.toHaveProperty("debug");

      await api.close();
    },
    AUTHZ_GUARD_TEST_TIMEOUT_MS
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
          tenantRole: "tenant_owner"
        }),
        getContextFacts: (request) => {
          const { tenantId } = request.params as { tenantId: string };
          return {
            targetTenantId: tenantId
          };
        }
      });

      const loginIdentifier = `owner+${randomUUID()}@vision.test`;
      await seedSubject("internal", loginIdentifier, "S3cure-password!", "none");
      const { cookie, sessionId } = await loginAndGetCookie(
        api,
        "internal",
        loginIdentifier,
        "S3cure-password!"
      );
      await setSessionScope(sessionId, {
        activeTenantId: "tenant_1"
      });

      const response = await api.inject({
        method: "POST",
        url: "/_test/website/tenant_1",
        headers: {
          cookie
        }
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        code: "insufficient_assurance",
        requiredAssurance: "step_up_verified"
      });
      expect(response.json()).not.toHaveProperty("debug");
      expect(response.json()).not.toHaveProperty("denialReason");

      await api.close();
    },
    AUTHZ_GUARD_TEST_TIMEOUT_MS
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
              resourceOwnerSubjectId: auth.subject.id
            })
          })
        },
        async () => ({ ok: true })
      );

      api.get(
        "/_test/customers/other",
        {
          preHandler: createAuthorizationGuard({
            resource: { family: "customer_account" },
            action: "read",
            getContextFacts: () => ({
              resourceOwnerSubjectId: "sub_other"
            })
          })
        },
        async () => ({ ok: true })
      );

      const loginIdentifier = `customer+${randomUUID()}@vision.test`;
      await seedSubject("customer", loginIdentifier, "S3cure-password!");
      const { cookie } = await loginAndGetCookie(
        api,
        "customer",
        loginIdentifier,
        "S3cure-password!"
      );

      const allowed = await api.inject({
        method: "GET",
        url: "/_test/customers/self",
        headers: {
          cookie
        }
      });
      expect(allowed.statusCode).toBe(200);
      expect(allowed.json()).toEqual({ ok: true });

      const denied = await api.inject({
        method: "GET",
        url: "/_test/customers/other",
        headers: {
          cookie
        }
      });
      expect(denied.statusCode).toBe(403);
      expect(denied.json()).toMatchObject({
        code: "self_access_only"
      });
      expect(denied.json()).not.toHaveProperty("debug");

      await api.close();
    },
    AUTHZ_GUARD_TEST_TIMEOUT_MS
  );
});
