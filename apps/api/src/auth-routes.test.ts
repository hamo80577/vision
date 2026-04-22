import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { inArray } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import * as OTPAuth from "otpauth";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  type AuthResolution,
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
  deriveAdminTargetDatabaseUrl,
  getDatabaseAdminConfig,
  getDatabaseRuntimeConfig,
} from "@vision/db";
import type { ActiveTenantAccessSnapshot } from "@vision/tenancy";

import { AUTH_SESSION_COOKIE_NAME } from "./auth-cookie";
import { buildApi } from "./server";

const AUTH_ROUTE_TEST_TIMEOUT_MS = 20_000;
const MFA_ENCRYPTION_KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
const FIXED_TEST_TIME = new Date("2026-04-21T12:00:00.000Z");

const runtimeConfig = getDatabaseRuntimeConfig(process.env);
const adminConfig = getDatabaseAdminConfig(process.env);

const runtime = {
  appEnv: runtimeConfig.appEnv,
  host: "127.0.0.1",
  port: 4000,
  databaseUrl: runtimeConfig.databaseUrl,
  mfaEncryptionKey: MFA_ENCRYPTION_KEY,
  mfaEncryptionKeyVersion: "v1",
  logLevel: "debug",
  serviceName: "vision-api",
} as const;

const runtimePool = createDatabasePool(runtimeConfig.databaseUrl);
const runtimeDb = createDatabaseClient(runtimePool);

const adminTargetDatabaseUrl = deriveAdminTargetDatabaseUrl(
  adminConfig.adminDatabaseUrl,
  adminConfig.adminTargetDatabaseName,
);
const adminPool = createDatabasePool(adminTargetDatabaseUrl);
const adminDb = createDatabaseClient(adminPool);

const authn = createAuthnService(runtimeDb, {
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

function buildApiWithTenancyAccess(
  resolveInternalTenancyAccess: (
    request: FastifyRequest,
    auth: AuthResolution,
  ) => ActiveTenantAccessSnapshot | null,
) {
  return buildApi({
    runtime,
    authService: authn,
    resolveInternalTenancyAccess,
  });
}

async function seedSubject(
  subjectType: "customer" | "internal",
  loginIdentifier: string,
  password: string,
  internalSensitivity:
    | "none"
    | "platform_admin"
    | "tenant_owner"
    | "branch_manager"
    | null = null,
) {
  const id = `sub_${randomUUID()}`;
  createdSubjectIds.push(id);

  await adminDb.insert(authSubjects).values({
    id,
    subjectType,
    loginIdentifier,
    normalizedLoginIdentifier: normalizeLoginIdentifier(loginIdentifier),
    passwordHash: await hashPassword(password),
    internalSensitivity,
  });
}

describe("auth routes", () => {
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

  it(
    "switches branch context through the dedicated route and writes one audit event",
    async () => {
      const api = buildApiWithTenancyAccess(() => ({
        tenantId: "tenant_1",
        tenantRole: "branch_manager",
        allowedBranchIds: ["branch_1", "branch_2"],
      }));
      const loginIdentifier = `switch-route+${randomUUID()}@vision.test`;
      await seedSubject("internal", loginIdentifier, "S3cure-password!", "none");

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

      await adminDb
        .update(authSessions)
        .set({
          activeTenantId: "tenant_1",
          activeBranchId: "branch_1",
        })
        .where(eq(authSessions.id, sessionId));

      const response = await api.inject({
        method: "POST",
        url: "/auth/internal/context/branch/switch",
        headers: {
          cookie,
        },
        payload: {
          branchId: "branch_2",
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        session: {
          activeTenantId: "tenant_1",
          activeBranchId: "branch_2",
        },
        branchSwitch: {
          requested: true,
          persisted: true,
          previousBranchId: "branch_1",
          nextBranchId: "branch_2",
        },
      });

      const events = await adminDb
        .select()
        .from(authAccountEvents)
        .where(eq(authAccountEvents.sessionId, sessionId));

      expect(
        events.filter((entry) => entry.eventType === "branch_context_switched"),
      ).toHaveLength(1);

      await api.close();
    },
    AUTH_ROUTE_TEST_TIMEOUT_MS,
  );

  it(
    "returns an idempotent no-op when switching to the current branch",
    async () => {
      const api = buildApiWithTenancyAccess(() => ({
        tenantId: "tenant_1",
        tenantRole: "branch_manager",
        allowedBranchIds: ["branch_1", "branch_2"],
      }));
      const loginIdentifier = `switch-noop+${randomUUID()}@vision.test`;
      await seedSubject("internal", loginIdentifier, "S3cure-password!", "none");

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

      await adminDb
        .update(authSessions)
        .set({
          activeTenantId: "tenant_1",
          activeBranchId: "branch_1",
        })
        .where(eq(authSessions.id, sessionId));

      const response = await api.inject({
        method: "POST",
        url: "/auth/internal/context/branch/switch",
        headers: {
          cookie,
        },
        payload: {
          branchId: "branch_1",
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        session: {
          activeTenantId: "tenant_1",
          activeBranchId: "branch_1",
        },
        branchSwitch: {
          requested: true,
          persisted: false,
          previousBranchId: "branch_1",
          nextBranchId: "branch_1",
        },
      });

      const events = await adminDb
        .select()
        .from(authAccountEvents)
        .where(eq(authAccountEvents.sessionId, sessionId));

      expect(
        events.filter((entry) => entry.eventType === "branch_context_switched"),
      ).toHaveLength(0);

      await api.close();
    },
    AUTH_ROUTE_TEST_TIMEOUT_MS,
  );

  it(
    "fails closed when the branch switch target is outside the active tenant scope",
    async () => {
      const api = buildApiWithTenancyAccess(() => ({
        tenantId: "tenant_1",
        tenantRole: "branch_manager",
        allowedBranchIds: ["branch_1"],
      }));
      const loginIdentifier = `switch-denied+${randomUUID()}@vision.test`;
      await seedSubject("internal", loginIdentifier, "S3cure-password!", "none");

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

      await adminDb
        .update(authSessions)
        .set({
          activeTenantId: "tenant_1",
          activeBranchId: "branch_1",
        })
        .where(eq(authSessions.id, sessionId));

      const response = await api.inject({
        method: "POST",
        url: "/auth/internal/context/branch/switch",
        headers: {
          cookie,
        },
        payload: {
          branchId: "branch_2",
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        code: "branch_not_in_active_tenant_scope",
      });

      const [session] = await runtimeDb
        .select()
        .from(authSessions)
        .where(eq(authSessions.id, sessionId));

      expect(session?.activeBranchId).toBe("branch_1");

      await api.close();
    },
    AUTH_ROUTE_TEST_TIMEOUT_MS,
  );

  it(
    "logs in a customer and resolves the current session",
    async () => {
      const api = buildApi({ runtime, authService: authn });
      const loginIdentifier = `customer+${randomUUID()}@vision.test`;
      await seedSubject("customer", loginIdentifier, "S3cure-password!");

      const login = await api.inject({
        method: "POST",
        url: "/auth/customer/login",
        payload: {
          loginIdentifier,
          password: "S3cure-password!",
        },
      });
      createdSessionIds.push((login.json() as { session: { sessionId: string } }).session.sessionId);

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
          loginIdentifier,
        },
      });

      await api.close();
    },
    AUTH_ROUTE_TEST_TIMEOUT_MS,
  );

  it(
    "logs in an internal subject and resolves the current session",
    async () => {
      const api = buildApi({ runtime, authService: authn });
      const loginIdentifier = `ops+${randomUUID()}@vision.test`;
      await seedSubject("internal", loginIdentifier, "S3cure-password!");

      const login = await api.inject({
        method: "POST",
        url: "/auth/internal/login",
        payload: {
          loginIdentifier,
          password: "S3cure-password!",
        },
      });
      createdSessionIds.push((login.json() as { session: { sessionId: string } }).session.sessionId);

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
    },
    AUTH_ROUTE_TEST_TIMEOUT_MS,
  );

  it(
    "rejects expired sessions",
    async () => {
      const api = buildApi({ runtime, authService: authn });
      const loginIdentifier = `expired+${randomUUID()}@vision.test`;
      await seedSubject("customer", loginIdentifier, "S3cure-password!");

      const login = await api.inject({
        method: "POST",
        url: "/auth/customer/login",
        payload: {
          loginIdentifier,
          password: "S3cure-password!",
        },
      });
      const cookie = getAuthCookie(login.headers["set-cookie"]);
      const sessionId = cookie.replace(`${AUTH_SESSION_COOKIE_NAME}=`, "").split(".")[0];
      createdSessionIds.push(sessionId);

      await adminDb
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
    },
    AUTH_ROUTE_TEST_TIMEOUT_MS,
  );

  it(
    "rejects revoked sessions and clears the cookie",
    async () => {
      const api = buildApi({ runtime, authService: authn });
      const loginIdentifier = `revoked+${randomUUID()}@vision.test`;
      await seedSubject("internal", loginIdentifier, "S3cure-password!");

      const login = await api.inject({
        method: "POST",
        url: "/auth/internal/login",
        payload: {
          loginIdentifier,
          password: "S3cure-password!",
        },
      });

      const cookie = getAuthCookie(login.headers["set-cookie"]);
      const sessionId = cookie.replace(`${AUTH_SESSION_COOKIE_NAME}=`, "").split(".")[0];
      createdSessionIds.push(sessionId);
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
    },
    AUTH_ROUTE_TEST_TIMEOUT_MS,
  );

  it(
    "revokes the current session on logout and prevents reuse",
    async () => {
      const api = buildApi({ runtime, authService: authn });
      const loginIdentifier = `logout+${randomUUID()}@vision.test`;
      await seedSubject("customer", loginIdentifier, "S3cure-password!");

      const login = await api.inject({
        method: "POST",
        url: "/auth/customer/login",
        payload: {
          loginIdentifier,
          password: "S3cure-password!",
        },
      });

      const cookie = getAuthCookie(login.headers["set-cookie"]);
      createdSessionIds.push(cookie.replace(`${AUTH_SESSION_COOKIE_NAME}=`, "").split(".")[0]);
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
    },
    AUTH_ROUTE_TEST_TIMEOUT_MS,
  );

  it(
    "invalidates the previous token after rotation",
    async () => {
      const api = buildApi({ runtime, authService: authn });
      const loginIdentifier = `rotate+${randomUUID()}@vision.test`;
      await seedSubject("internal", loginIdentifier, "S3cure-password!");

      const login = await api.inject({
        method: "POST",
        url: "/auth/internal/login",
        payload: {
          loginIdentifier,
          password: "S3cure-password!",
        },
      });

      const originalCookie = getAuthCookie(login.headers["set-cookie"]);
      createdSessionIds.push(
        originalCookie.replace(`${AUTH_SESSION_COOKIE_NAME}=`, "").split(".")[0],
      );
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
    },
    AUTH_ROUTE_TEST_TIMEOUT_MS,
  );

  it(
    "returns a pending challenge for a sensitive internal login without setting a cookie",
    async () => {
      const api = buildApi({ runtime, authService: authn });
      const loginIdentifier = `admin+${randomUUID()}@vision.test`;
      await seedSubject("internal", loginIdentifier, "S3cure-password!", "platform_admin");

      const response = await api.inject({
        method: "POST",
        url: "/auth/internal/login",
        payload: {
          loginIdentifier,
          password: "S3cure-password!",
        },
      });

      expect(response.statusCode).toBe(202);
      expect(response.headers["set-cookie"]).toBeUndefined();
      expect(response.json()).toMatchObject({
        nextStep: "mfa_enrollment_required",
        requiredAssurance: "mfa_verified",
      });

      await api.close();
    },
    AUTH_ROUTE_TEST_TIMEOUT_MS,
  );

  it(
    "completes MFA enrollment and sets a real auth cookie only after verification",
    async () => {
      const api = buildApi({ runtime, authService: authn });
      const loginIdentifier = `owner+${randomUUID()}@vision.test`;
      await seedSubject("internal", loginIdentifier, "S3cure-password!", "tenant_owner");

      const login = await api.inject({
        method: "POST",
        url: "/auth/internal/login",
        payload: {
          loginIdentifier,
          password: "S3cure-password!",
        },
      });
      const challengeToken = (login.json() as { challengeToken: string }).challengeToken;

      const start = await api.inject({
        method: "POST",
        url: "/auth/internal/mfa/enrollment/start",
        payload: {
          challengeToken,
          accountName: loginIdentifier,
        },
      });
      const enrollment = start.json() as { manualEntryKey: string };
      const totp = new OTPAuth.TOTP({
        issuer: "Vision",
        label: loginIdentifier,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(enrollment.manualEntryKey),
      });
      const code = totp.generate({ timestamp: FIXED_TEST_TIME.getTime() });

      const verify = await api.inject({
        method: "POST",
        url: "/auth/internal/mfa/enrollment/verify",
        payload: {
          challengeToken,
          code,
        },
      });

      expect(verify.statusCode).toBe(200);
      expect(verify.headers["set-cookie"]).toContain("HttpOnly");
      expect(verify.json()).toMatchObject({
        session: {
          assuranceLevel: "mfa_verified",
        },
      });

      await api.close();
    },
    AUTH_ROUTE_TEST_TIMEOUT_MS,
  );

  it(
    "returns 403 insufficient_assurance when backup-code regeneration is called without step-up",
    async () => {
      const api = buildApi({ runtime, authService: authn });
      const loginIdentifier = `manager+${randomUUID()}@vision.test`;
      await seedSubject("internal", loginIdentifier, "S3cure-password!", "branch_manager");

      const login = await api.inject({
        method: "POST",
        url: "/auth/internal/login",
        payload: {
          loginIdentifier,
          password: "S3cure-password!",
        },
      });
      const challengeToken = (login.json() as { challengeToken: string }).challengeToken;
      const start = await api.inject({
        method: "POST",
        url: "/auth/internal/mfa/enrollment/start",
        payload: {
          challengeToken,
          accountName: loginIdentifier,
        },
      });
      const enrollment = start.json() as { manualEntryKey: string };
      const totp = new OTPAuth.TOTP({
        issuer: "Vision",
        label: loginIdentifier,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(enrollment.manualEntryKey),
      });
      const code = totp.generate({ timestamp: FIXED_TEST_TIME.getTime() });
      const verify = await api.inject({
        method: "POST",
        url: "/auth/internal/mfa/enrollment/verify",
        payload: {
          challengeToken,
          code,
        },
      });
      const cookie = getAuthCookie(verify.headers["set-cookie"]);

      const response = await api.inject({
        method: "POST",
        url: "/auth/internal/mfa/backup-codes/regenerate",
        headers: {
          cookie,
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        code: "insufficient_assurance",
        requiredAssurance: "step_up_verified",
        denialReason: "step_up_required",
      });

      await api.close();
    },
    AUTH_ROUTE_TEST_TIMEOUT_MS,
  );
});
