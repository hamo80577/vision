import { randomUUID } from "node:crypto";

import { desc, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import * as OTPAuth from "otpauth";
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
  tenantOnboardingLinks,
  tenantOwners,
  tenants,
} from "@vision/db";

import {
  AUTH_CSRF_COOKIE_NAME,
  AUTH_CSRF_HEADER_NAME,
  AUTH_SESSION_COOKIE_NAME,
} from "./auth-cookie";
import { buildApi } from "./server";
import { createPlatformProvisioningService } from "./modules/platform-provisioning/service";

const MFA_ENCRYPTION_KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
const FIXED_TEST_TIME = new Date("2026-04-24T10:00:00.000Z");
const TEST_TIMEOUT_MS = 20_000;

const runtimeConfig = {
  appEnv: "local" as const,
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgresql://vision_runtime:vision_runtime_password@localhost:5433/vision_local",
};
const adminConfig = {
  adminDatabaseUrl:
    process.env.DATABASE_ADMIN_URL ??
    "postgresql://vision_admin:vision_admin_password@localhost:5433/postgres",
  adminTargetDatabaseName: process.env.DATABASE_ADMIN_TARGET_DB ?? "vision_local",
};

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
const provisioningService = createPlatformProvisioningService({
  db: runtimeDb,
  now: () => new Date(FIXED_TEST_TIME),
});

function getCookieValue(setCookie: string | string[] | undefined, cookieName: string): string {
  const values = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const raw = values.find((candidate) => candidate.startsWith(`${cookieName}=`));

  if (!raw) {
    throw new Error(`Missing ${cookieName} Set-Cookie header.`);
  }

  return (raw.split(";")[0] ?? raw).replace(`${cookieName}=`, "");
}

function getAuthCookie(setCookie: string | string[] | undefined): string {
  return `${AUTH_SESSION_COOKIE_NAME}=${getCookieValue(setCookie, AUTH_SESSION_COOKIE_NAME)}`;
}

function getCsrfToken(setCookie: string | string[] | undefined): string {
  return getCookieValue(setCookie, AUTH_CSRF_COOKIE_NAME);
}

function buildAuthenticatedMutationHeaders(
  setCookie: string | string[] | undefined,
): Record<string, string> {
  const csrfToken = getCsrfToken(setCookie);

  return {
    cookie: `${getAuthCookie(setCookie)}; ${AUTH_CSRF_COOKIE_NAME}=${csrfToken}`,
    [AUTH_CSRF_HEADER_NAME]: csrfToken,
  };
}

function createTotpCode(manualEntryKey: string, accountName: string): string {
  const totp = new OTPAuth.TOTP({
    issuer: "Vision",
    label: accountName,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(manualEntryKey),
  });

  return totp.generate({ timestamp: FIXED_TEST_TIME.getTime() });
}

async function seedSubject(
  subjectType: "customer" | "internal",
  loginIdentifier: string,
  password: string,
  internalSensitivity: "none" | "platform_admin" | "tenant_owner" | "branch_manager" | null = null,
) {
  const id = `sub_${randomUUID()}`;

  await adminDb.insert(authSubjects).values({
    id,
    subjectType,
    loginIdentifier,
    normalizedLoginIdentifier: normalizeLoginIdentifier(loginIdentifier),
    passwordHash: await hashPassword(password),
    internalSensitivity,
  });

  return id;
}

async function createMfaVerifiedInternalSession(
  api: FastifyInstance,
  input: {
    loginIdentifier: string;
    internalSensitivity: "platform_admin" | "tenant_owner" | "branch_manager";
  },
) {
  await seedSubject(
    "internal",
    input.loginIdentifier,
    "S3cure-password!",
    input.internalSensitivity,
  );

  const login = await api.inject({
    method: "POST",
    url: "/auth/internal/login",
    payload: {
      loginIdentifier: input.loginIdentifier,
      password: "S3cure-password!",
    },
  });
  const challengeToken = (login.json() as { challengeToken: string }).challengeToken;

  const start = await api.inject({
    method: "POST",
    url: "/auth/internal/mfa/enrollment/start",
    payload: {
      challengeToken,
      accountName: input.loginIdentifier,
    },
  });
  const enrollment = start.json() as { manualEntryKey: string };

  const verify = await api.inject({
    method: "POST",
    url: "/auth/internal/mfa/enrollment/verify",
    payload: {
      challengeToken,
      code: createTotpCode(enrollment.manualEntryKey, input.loginIdentifier),
    },
  });

  return {
    verify,
    sessionId: (verify.json() as { session: { sessionId: string } }).session.sessionId,
  };
}

describe("platform provisioning routes", () => {
  let createdTenantIds: string[] = [];
  let createdSubjectIds: string[] = [];
  let createdSessionIds: string[] = [];

  beforeEach(() => {
    createdTenantIds = [];
    createdSubjectIds = [];
    createdSessionIds = [];
  });

  afterEach(async () => {
    if (createdTenantIds.length > 0) {
      await adminDb.delete(tenants).where(inArray(tenants.id, createdTenantIds));
    }

    if (createdSessionIds.length > 0) {
      await adminDb
        .delete(authAccountEvents)
        .where(inArray(authAccountEvents.sessionId, createdSessionIds));
      await adminDb.delete(authSessions).where(inArray(authSessions.id, createdSessionIds));
    }

    if (createdSubjectIds.length > 0) {
      await adminDb
        .delete(authAccountEvents)
        .where(inArray(authAccountEvents.subjectId, createdSubjectIds));
      await adminDb.delete(authSubjects).where(inArray(authSubjects.id, createdSubjectIds));
    }
  });

  afterAll(async () => {
    await closeDatabasePool(runtimePool);
    await closeDatabasePool(adminPool);
  });

  it(
    "creates tenants through the platform route and lists shaped directory data",
    async () => {
      const api = buildApi({
        runtime,
        authService: authn,
        platformProvisioningService: provisioningService,
      });
      const loginIdentifier = `platform-admin+${randomUUID()}@vision.test`;
      const session = await createMfaVerifiedInternalSession(api, {
        loginIdentifier,
        internalSensitivity: "platform_admin",
      });
      createdSubjectIds.push(
        (
          await adminDb
            .select()
            .from(authSubjects)
            .where(eq(authSubjects.normalizedLoginIdentifier, loginIdentifier))
        )[0]!.id,
      );
      createdSessionIds.push(session.sessionId);

      const createResponse = await api.inject({
        method: "POST",
        url: "/platform/tenants",
        headers: buildAuthenticatedMutationHeaders(session.verify.headers["set-cookie"]),
        payload: {
          tenant: {
            slug: `tenant-${randomUUID().slice(0, 8)}`,
            displayName: "Silver Birch Spa",
          },
          owner: {
            fullName: "Dina Samir",
            phoneNumber: "+201555555555",
            email: "dina@silverbirch.test",
          },
          subscription: {
            planCode: "growth",
            billingInterval: "monthly",
            renewalMode: "auto",
            status: "active",
            amountMinor: 250000,
            currencyCode: "usd",
            currentPeriodStartAt: "2026-04-01T00:00:00.000Z",
            currentPeriodEndAt: "2026-05-01T00:00:00.000Z",
            renewsAt: "2026-05-01T00:00:00.000Z",
          },
          entitlements: {
            maxBranches: 4,
            maxInternalUsers: 24,
            bookingWebsiteEnabled: true,
            enabledModules: ["appointments", "analytics"],
          },
        },
      });

      expect(createResponse.statusCode).toBe(201);
      const created = createResponse.json() as {
        tenant: {
          id: string;
          owner: { onboardingLinkStatus: string };
          subscription: { currencyCode: string };
        };
        ownerOnboardingLink: { activationToken: string; activationPath: string };
      };
      createdTenantIds.push(created.tenant.id);

      expect(created).toMatchObject({
        tenant: {
          owner: {
            onboardingLinkStatus: "issued",
          },
          subscription: {
            currencyCode: "USD",
          },
        },
        ownerOnboardingLink: {
          activationToken: expect.any(String),
          activationPath: expect.stringMatching(/^\/owner-activation\//),
        },
      });

      const listResponse = await api.inject({
        method: "GET",
        url: "/platform/tenants",
        headers: {
          cookie: getAuthCookie(session.verify.headers["set-cookie"]),
        },
      });

      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: created.tenant.id,
            displayName: "Silver Birch Spa",
            owner: expect.objectContaining({
              onboardingLinkStatus: "issued",
            }),
            subscription: expect.objectContaining({
              currencyCode: "USD",
            }),
          }),
        ]),
      );

      const [storedLink] = await adminDb
        .select()
        .from(tenantOnboardingLinks)
        .orderBy(desc(tenantOnboardingLinks.issuedAt));
      expect(storedLink?.tokenHash).not.toBe(created.ownerOnboardingLink.activationToken);

      await api.close();
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "rejects non-platform internal users from the platform provisioning surface",
    async () => {
      const api = buildApi({
        runtime,
        authService: authn,
        platformProvisioningService: provisioningService,
      });
      const loginIdentifier = `branch-manager+${randomUUID()}@vision.test`;
      const session = await createMfaVerifiedInternalSession(api, {
        loginIdentifier,
        internalSensitivity: "branch_manager",
      });
      createdSubjectIds.push(
        (
          await adminDb
            .select()
            .from(authSubjects)
            .where(eq(authSubjects.normalizedLoginIdentifier, loginIdentifier))
        )[0]!.id,
      );
      createdSessionIds.push(session.sessionId);

      const response = await api.inject({
        method: "GET",
        url: "/platform/tenants",
        headers: {
          cookie: getAuthCookie(session.verify.headers["set-cookie"]),
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        code: "insufficient_scope",
      });

      await api.close();
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "reissues onboarding links and suspends tenants through the dedicated platform routes",
    async () => {
      const api = buildApi({
        runtime,
        authService: authn,
        platformProvisioningService: provisioningService,
      });
      const loginIdentifier = `platform-admin+${randomUUID()}@vision.test`;
      const session = await createMfaVerifiedInternalSession(api, {
        loginIdentifier,
        internalSensitivity: "platform_admin",
      });
      const [platformAdmin] = await adminDb
        .select()
        .from(authSubjects)
        .where(eq(authSubjects.normalizedLoginIdentifier, loginIdentifier));
      createdSubjectIds.push(platformAdmin!.id);
      createdSessionIds.push(session.sessionId);

      const createResponse = await api.inject({
        method: "POST",
        url: "/platform/tenants",
        headers: buildAuthenticatedMutationHeaders(session.verify.headers["set-cookie"]),
        payload: {
          tenant: {
            slug: `tenant-${randomUUID().slice(0, 8)}`,
            displayName: "Juniper House",
          },
          owner: {
            fullName: "Salma Nabil",
            phoneNumber: "+201666666666",
          },
          subscription: {
            planCode: "starter",
            billingInterval: "monthly",
            renewalMode: "manual",
            status: "trialing",
            amountMinor: 0,
            currencyCode: "USD",
            currentPeriodStartAt: "2026-04-01T00:00:00.000Z",
            currentPeriodEndAt: "2026-05-01T00:00:00.000Z",
            renewsAt: null,
          },
          entitlements: {
            maxBranches: 1,
            maxInternalUsers: 4,
            bookingWebsiteEnabled: false,
            enabledModules: ["appointments"],
          },
        },
      });
      const created = createResponse.json() as { tenant: { id: string } };
      createdTenantIds.push(created.tenant.id);

      const ownerSubjectId = await seedSubject(
        "internal",
        `owner+${randomUUID()}@vision.test`,
        "S3cure-password!",
        "tenant_owner",
      );
      createdSubjectIds.push(ownerSubjectId);
      const ownerSessionId = `ses_${randomUUID()}`;
      createdSessionIds.push(ownerSessionId);
      await adminDb.insert(authSessions).values({
        id: ownerSessionId,
        subjectId: ownerSubjectId,
        subjectType: "internal",
        secretHash: "test-secret-hash",
        assuranceLevel: "mfa_verified",
        assuranceUpdatedAt: FIXED_TEST_TIME,
        issuedAt: FIXED_TEST_TIME,
        expiresAt: new Date(FIXED_TEST_TIME.getTime() + 60 * 60 * 1000),
        lastRotatedAt: FIXED_TEST_TIME,
        createdAt: FIXED_TEST_TIME,
        updatedAt: FIXED_TEST_TIME,
      });

      const [tenantOwner] = await adminDb
        .select()
        .from(tenantOwners)
        .where(eq(tenantOwners.tenantId, created.tenant.id));
      await adminDb
        .update(tenantOwners)
        .set({
          authSubjectId: ownerSubjectId,
          status: "activated",
          activatedAt: FIXED_TEST_TIME,
          updatedAt: FIXED_TEST_TIME,
        })
        .where(eq(tenantOwners.id, tenantOwner!.id));

      const reissueResponse = await api.inject({
        method: "POST",
        url: `/platform/tenants/${created.tenant.id}/owner-onboarding-links`,
        headers: buildAuthenticatedMutationHeaders(session.verify.headers["set-cookie"]),
        payload: {},
      });

      expect(reissueResponse.statusCode).toBe(201);
      expect(reissueResponse.json()).toMatchObject({
        activationToken: expect.any(String),
        activationPath: expect.stringMatching(/^\/owner-activation\//),
      });

      const suspendResponse = await api.inject({
        method: "POST",
        url: `/platform/tenants/${created.tenant.id}/suspend`,
        headers: buildAuthenticatedMutationHeaders(session.verify.headers["set-cookie"]),
        payload: {},
      });

      expect(suspendResponse.statusCode).toBe(200);
      expect(suspendResponse.json()).toMatchObject({
        status: "suspended",
        owner: {
          onboardingLinkStatus: "revoked",
        },
      });

      const [ownerSession] = await adminDb
        .select()
        .from(authSessions)
        .where(eq(authSessions.id, ownerSessionId));
      expect(ownerSession?.revokedAt).not.toBeNull();
      expect(ownerSession?.revocationReason).toBe("tenant_suspended");

      await api.close();
    },
    TEST_TIMEOUT_MS,
  );
});
