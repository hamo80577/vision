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
  deriveAdminTargetDatabaseUrl,
  getDatabaseAdminConfig,
  getDatabaseRuntimeConfig,
} from "@vision/db";

import { AUTH_SESSION_COOKIE_NAME } from "./auth-cookie";
import { createAuthorizationGuard } from "./authz-guard";
import { createTenancyGuard } from "./tenancy-guard";
import { buildApi } from "./server";

const runtimeConfig = getDatabaseRuntimeConfig(process.env);
const adminConfig = getDatabaseAdminConfig(process.env);

const runtimePool = createDatabasePool(runtimeConfig.databaseUrl);
const runtimeDb = createDatabaseClient(runtimePool);

const adminTargetDatabaseUrl = deriveAdminTargetDatabaseUrl(
  adminConfig.adminDatabaseUrl,
  adminConfig.adminTargetDatabaseName,
);
const adminPool = createDatabasePool(adminTargetDatabaseUrl);
const adminDb = createDatabaseClient(adminPool);

const authn = createAuthnService(runtimeDb, {
  sessionTtlMs: 60 * 60 * 1000,
  mfaEncryptionKey: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
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

async function seedInternalSubject(loginIdentifier: string) {
  const id = `sub_${randomUUID()}`;
  createdSubjectIds.push(id);

  await adminDb.insert(authSubjects).values({
    id,
    subjectType: "internal",
    loginIdentifier,
    normalizedLoginIdentifier: normalizeLoginIdentifier(loginIdentifier),
    passwordHash: await hashPassword("S3cure-password!"),
    internalSensitivity: "none",
  });
}

describe("createTenancyGuard", () => {
  beforeEach(() => {
    createdSubjectIds = [];
    createdSessionIds = [];
  });

  afterEach(async () => {
    if (createdSessionIds.length > 0) {
      await adminDb
        .delete(authAccountEvents)
        .where(inArray(authAccountEvents.sessionId, createdSessionIds));
      await adminDb
        .delete(authSessions)
        .where(inArray(authSessions.id, createdSessionIds));
    }

    if (createdSubjectIds.length > 0) {
      await adminDb
        .delete(authAccountEvents)
        .where(inArray(authAccountEvents.subjectId, createdSubjectIds));
      await adminDb
        .delete(authSubjects)
        .where(inArray(authSubjects.id, createdSubjectIds));
    }
  });

  afterAll(async () => {
    await closeDatabasePool(runtimePool);
    await closeDatabasePool(adminPool);
  });

  it("returns 401 before tenancy when the session is missing", async () => {
    const api = buildApi({
      runtime: {
        appEnv: runtimeConfig.appEnv,
        host: "127.0.0.1",
        port: 4000,
        databaseUrl: runtimeConfig.databaseUrl,
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
        appEnv: runtimeConfig.appEnv,
        host: "127.0.0.1",
        port: 4000,
        databaseUrl: runtimeConfig.databaseUrl,
        mfaEncryptionKey: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
        mfaEncryptionKeyVersion: "v1",
        logLevel: "debug",
        serviceName: "vision-api",
      },
      authService: authn,
    });

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
    const sessionId =
      cookie.replace(`${AUTH_SESSION_COOKIE_NAME}=`, "").split(".")[0] ?? "";
    createdSessionIds.push(sessionId);

    await adminDb
      .update(authSessions)
      .set({
        activeTenantId: "tenant_1",
        activeBranchId: "branch_1",
      })
      .where(eq(authSessions.id, sessionId));

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
