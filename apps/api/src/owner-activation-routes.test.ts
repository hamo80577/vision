import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { hashPassword, normalizeLoginIdentifier } from "@vision/authn";
import {
  authSubjects,
  closeDatabasePool,
  createDatabaseClient,
  createDatabasePool,
  deriveAdminTargetDatabaseUrl,
  tenantOwners,
  tenants,
} from "@vision/db";

import { buildApi } from "./server";
import { createPlatformProvisioningService } from "./modules/platform-provisioning/service";

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
  mfaEncryptionKey: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
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
const TEST_TIMEOUT_MS = 20_000;

async function seedInternalSubject(input: {
  loginIdentifier: string;
  internalSensitivity: "platform_admin" | "tenant_owner";
}) {
  const id = `sub_${randomUUID()}`;

  await adminDb.insert(authSubjects).values({
    id,
    subjectType: "internal",
    loginIdentifier: input.loginIdentifier,
    normalizedLoginIdentifier: normalizeLoginIdentifier(input.loginIdentifier),
    passwordHash: await hashPassword("S3cure-password!"),
    internalSensitivity: input.internalSensitivity,
  });

  return id;
}

describe("owner activation routes", () => {
  const provisioningService = createPlatformProvisioningService({
    db: runtimeDb,
  });

  let createdTenantIds: string[] = [];
  let createdSubjectIds: string[] = [];

  beforeEach(() => {
    createdTenantIds = [];
    createdSubjectIds = [];
  });

  afterEach(async () => {
    if (createdTenantIds.length > 0) {
      await adminDb.delete(tenants).where(inArray(tenants.id, createdTenantIds));
    }

    if (createdSubjectIds.length > 0) {
      await adminDb.delete(authSubjects).where(inArray(authSubjects.id, createdSubjectIds));
    }
  });

  afterAll(async () => {
    await closeDatabasePool(runtimePool);
    await closeDatabasePool(adminPool);
  });

  it("validates activation tokens through the public route and completes activation with MFA continuation", async () => {
    const api = buildApi({
      runtime,
    });
    const platformAdminSubjectId = await seedInternalSubject({
      loginIdentifier: `platform-admin+${randomUUID()}@vision.test`,
      internalSensitivity: "platform_admin",
    });
    createdSubjectIds.push(platformAdminSubjectId);

    const created = await provisioningService.createTenant({
      actorSubjectId: platformAdminSubjectId,
      payload: {
        tenant: {
          slug: `tenant-${randomUUID().slice(0, 8)}`,
          displayName: "Solstice House",
        },
        owner: {
          fullName: "Farah Khaled",
          phoneNumber: "+201000112233",
          email: "farah@solstice.test",
        },
        subscription: {
          planCode: "growth",
          billingInterval: "monthly",
          renewalMode: "auto",
          status: "active",
          amountMinor: 135000,
          currencyCode: "USD",
          currentPeriodStartAt: "2026-04-01T00:00:00.000Z",
          currentPeriodEndAt: "2026-05-01T00:00:00.000Z",
          renewsAt: "2026-05-01T00:00:00.000Z",
        },
        entitlements: {
          maxBranches: 2,
          maxInternalUsers: 10,
          bookingWebsiteEnabled: true,
          enabledModules: ["appointments", "analytics"],
        },
      },
    });
    createdTenantIds.push(created.tenant.id);

    const validateResponse = await api.inject({
      method: "GET",
      url: `/owner-activation/${created.ownerOnboardingLink.activationToken}`,
    });

    expect(validateResponse.statusCode).toBe(200);
    expect(validateResponse.json()).toMatchObject({
      onboardingLinkStatus: "issued",
      owner: {
        fullName: "Farah Khaled",
        maskedPhoneNumber: expect.any(String),
        maskedEmail: expect.any(String),
      },
    });

    const completeResponse = await api.inject({
      method: "POST",
      url: `/owner-activation/${created.ownerOnboardingLink.activationToken}/complete`,
      payload: {
        password: "S3cure-owner-password!",
        passwordConfirmation: "S3cure-owner-password!",
      },
    });

    expect(completeResponse.statusCode).toBe(200);
    const completed = completeResponse.json() as {
      subjectId: string;
      nextStep: string;
      challengeToken: string;
    };
    createdSubjectIds.push(completed.subjectId);

    expect(completed).toMatchObject({
      nextStep: "mfa_enrollment_required",
      challengeToken: expect.any(String),
    });

    const [owner] = await adminDb
      .select()
      .from(tenantOwners)
      .where(eq(tenantOwners.tenantId, created.tenant.id));
    expect(owner?.authSubjectId).toBe(completed.subjectId);

    const consumedResponse = await api.inject({
      method: "GET",
      url: `/owner-activation/${created.ownerOnboardingLink.activationToken}`,
    });
    expect(consumedResponse.statusCode).toBe(200);
    expect(consumedResponse.json()).toMatchObject({
      onboardingLinkStatus: "consumed",
    });

    await api.close();
  }, TEST_TIMEOUT_MS);

  it("handles invalid activation tokens safely through HTTP", async () => {
    const api = buildApi({
      runtime,
    });

    const validateResponse = await api.inject({
      method: "GET",
      url: "/owner-activation/not-a-real-token",
    });

    expect(validateResponse.statusCode).toBe(404);
    expect(validateResponse.json()).toMatchObject({
      code: "activation_link_invalid",
    });

    const completeResponse = await api.inject({
      method: "POST",
      url: "/owner-activation/not-a-real-token/complete",
      payload: {
        password: "S3cure-owner-password!",
        passwordConfirmation: "S3cure-owner-password!",
      },
    });

    expect(completeResponse.statusCode).toBe(404);
    expect(completeResponse.json()).toMatchObject({
      code: "activation_link_invalid",
    });

    await api.close();
  }, TEST_TIMEOUT_MS);
});
