import { randomUUID } from "node:crypto";

import { desc, eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { hashPassword, normalizeLoginIdentifier } from "@vision/authn";
import {
  authAssuranceChallenges,
  authSubjects,
  closeDatabasePool,
  createDatabaseClient,
  createDatabasePool,
  deriveAdminTargetDatabaseUrl,
  tenantLifecycleEvents,
  tenantOnboardingLinks,
  tenantOwners,
  tenants,
} from "@vision/db";

import { createPlatformProvisioningService } from "../platform-provisioning/service";
import { createOwnerActivationService } from "./service";

const FIXED_TEST_TIME = new Date("2026-04-24T12:00:00.000Z");

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

describe("owner activation service", () => {
  const provisioningService = createPlatformProvisioningService({
    db: runtimeDb,
    now: () => new Date(FIXED_TEST_TIME),
  });
  const ownerActivationService = createOwnerActivationService({
    db: runtimeDb,
    now: () => new Date(FIXED_TEST_TIME),
    mfaChallengeTtlMs: 10 * 60 * 1000,
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

  it("validates issued onboarding links with masked activation-safe context only", async () => {
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
          displayName: "Azure Willow Clinic",
        },
        owner: {
          fullName: "Lina Youssef",
          phoneNumber: "+201234567890",
          email: "lina@azurewillow.test",
        },
        subscription: {
          planCode: "growth",
          billingInterval: "monthly",
          renewalMode: "auto",
          status: "active",
          amountMinor: 215000,
          currencyCode: "USD",
          currentPeriodStartAt: "2026-04-01T00:00:00.000Z",
          currentPeriodEndAt: "2026-05-01T00:00:00.000Z",
          renewsAt: "2026-05-01T00:00:00.000Z",
        },
        entitlements: {
          maxBranches: 3,
          maxInternalUsers: 12,
          bookingWebsiteEnabled: true,
          enabledModules: ["appointments", "analytics"],
        },
      },
    });
    createdTenantIds.push(created.tenant.id);

    const validated = await ownerActivationService.validateActivationToken({
      activationToken: created.ownerOnboardingLink.activationToken,
    });

    expect(validated).toMatchObject({
      onboardingLinkStatus: "issued",
      tenant: {
        displayName: "Azure Willow Clinic",
        slug: created.tenant.slug,
      },
      owner: {
        fullName: "Lina Youssef",
        maskedPhoneNumber: expect.any(String),
        maskedEmail: expect.any(String),
      },
    });
    expect(validated.owner.maskedPhoneNumber).not.toContain("+201234567890");
    expect(validated.owner.maskedEmail).not.toContain("lina@azurewillow.test");
  }, TEST_TIMEOUT_MS);

  it("creates the owner auth subject at activation completion, consumes the link, and returns MFA continuation", async () => {
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
          displayName: "North Harbor Spa",
        },
        owner: {
          fullName: "Yara Nabil",
          phoneNumber: "+201111223344",
          email: "yara@northharbor.test",
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
          maxInternalUsers: 5,
          bookingWebsiteEnabled: false,
          enabledModules: ["appointments"],
        },
      },
    });
    createdTenantIds.push(created.tenant.id);

    const completed = await ownerActivationService.completeActivation({
      activationToken: created.ownerOnboardingLink.activationToken,
      password: "S3cure-owner-password!",
      passwordConfirmation: "S3cure-owner-password!",
    });
    createdSubjectIds.push(completed.subjectId);

    expect(completed).toMatchObject({
      nextStep: "mfa_enrollment_required",
      requiredAssurance: "mfa_verified",
      challengeToken: expect.any(String),
      owner: {
        fullName: "Yara Nabil",
        loginIdentifier: "+201111223344",
      },
    });

    const [subject] = await adminDb
      .select()
      .from(authSubjects)
      .where(eq(authSubjects.id, completed.subjectId));
    expect(subject).toMatchObject({
      subjectType: "internal",
      internalSensitivity: "tenant_owner",
      loginIdentifier: "+201111223344",
      normalizedLoginIdentifier: normalizeLoginIdentifier("+201111223344"),
    });

    const [owner] = await adminDb
      .select()
      .from(tenantOwners)
      .where(eq(tenantOwners.tenantId, created.tenant.id));
    expect(owner).toMatchObject({
      authSubjectId: completed.subjectId,
      status: "activated",
    });

    const [challenge] = await adminDb
      .select()
      .from(authAssuranceChallenges)
      .where(eq(authAssuranceChallenges.id, completed.challengeId));
    expect(challenge).toMatchObject({
      subjectId: completed.subjectId,
      requiredAssurance: "mfa_verified",
      reason: "mfa_enrollment",
    });

    const [latestLink] = await adminDb
      .select()
      .from(tenantOnboardingLinks)
      .where(eq(tenantOnboardingLinks.tenantOwnerId, owner!.id))
      .orderBy(desc(tenantOnboardingLinks.issuedAt));
    expect(latestLink?.consumedAt).not.toBeNull();

    const lifecycle = await adminDb
      .select()
      .from(tenantLifecycleEvents)
      .where(eq(tenantLifecycleEvents.tenantId, created.tenant.id))
      .orderBy(desc(tenantLifecycleEvents.occurredAt));
    expect(lifecycle.map((event) => event.eventType)).toContain("owner_activated");

    const validatedAfterCompletion = await ownerActivationService.validateActivationToken({
      activationToken: created.ownerOnboardingLink.activationToken,
    });
    expect(validatedAfterCompletion.onboardingLinkStatus).toBe("consumed");
  }, TEST_TIMEOUT_MS);

  it("handles invalid, expired, and revoked links safely", async () => {
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
          displayName: "Elm Court Studio",
        },
        owner: {
          fullName: "Mona Adel",
          phoneNumber: "+201555998877",
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
          maxInternalUsers: 5,
          bookingWebsiteEnabled: false,
          enabledModules: ["appointments"],
        },
      },
    });
    createdTenantIds.push(created.tenant.id);

    await expect(
      ownerActivationService.validateActivationToken({
        activationToken: "totally-invalid-token",
      }),
    ).rejects.toMatchObject({
      code: "activation_link_invalid",
    });

    const [owner] = await adminDb
      .select()
      .from(tenantOwners)
      .where(eq(tenantOwners.tenantId, created.tenant.id));
    await adminDb
      .update(tenantOnboardingLinks)
      .set({
        expiresAt: new Date(FIXED_TEST_TIME.getTime() - 60 * 1000),
      })
      .where(eq(tenantOnboardingLinks.tenantOwnerId, owner!.id));

    const expired = await ownerActivationService.validateActivationToken({
      activationToken: created.ownerOnboardingLink.activationToken,
    });
    expect(expired.onboardingLinkStatus).toBe("expired");

    await expect(
      ownerActivationService.completeActivation({
        activationToken: created.ownerOnboardingLink.activationToken,
        password: "S3cure-owner-password!",
        passwordConfirmation: "S3cure-owner-password!",
      }),
    ).rejects.toMatchObject({
      code: "activation_link_expired",
    });
  }, TEST_TIMEOUT_MS);
});
