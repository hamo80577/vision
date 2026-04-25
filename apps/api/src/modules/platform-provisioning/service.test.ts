import { randomUUID } from "node:crypto";

import { desc, eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { hashPassword, normalizeLoginIdentifier } from "@vision/authn";
import {
  authAccountEvents,
  authSessions,
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

import { createPlatformProvisioningService } from "./service";

const FIXED_TEST_TIME = new Date("2026-04-24T10:00:00.000Z");

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

async function seedInternalSubject(
  loginIdentifier: string,
  internalSensitivity: "platform_admin" | "tenant_owner",
) {
  const id = `sub_${randomUUID()}`;

  await adminDb.insert(authSubjects).values({
    id,
    subjectType: "internal",
    loginIdentifier,
    normalizedLoginIdentifier: normalizeLoginIdentifier(loginIdentifier),
    passwordHash: await hashPassword("S3cure-password!"),
    internalSensitivity,
  });

  return id;
}

async function seedInternalSession(subjectId: string) {
  const sessionId = `ses_${randomUUID()}`;

  await adminDb.insert(authSessions).values({
    id: sessionId,
    subjectId,
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

  return sessionId;
}

describe("platform provisioning service", () => {
  const service = createPlatformProvisioningService({
    db: runtimeDb,
    now: () => new Date(FIXED_TEST_TIME),
  });

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

  it("creates the full Phase 10 provisioning slice transactionally and stores only onboarding token hashes", async () => {
    const platformAdminSubjectId = await seedInternalSubject(
      `platform-admin+${randomUUID()}@vision.test`,
      "platform_admin",
    );
    createdSubjectIds.push(platformAdminSubjectId);

    const result = await service.createTenant({
      actorSubjectId: platformAdminSubjectId,
      payload: {
        tenant: {
          slug: `tenant-${randomUUID().slice(0, 8)}`,
          displayName: "North Star Spa",
        },
        owner: {
          fullName: "Maya Hassan",
          phoneNumber: "+201234567890",
          email: "maya@northstar.test",
        },
        subscription: {
          planCode: "growth",
          billingInterval: "monthly",
          renewalMode: "auto",
          status: "active",
          amountMinor: 125000,
          currencyCode: "USD",
          currentPeriodStartAt: "2026-04-01T00:00:00.000Z",
          currentPeriodEndAt: "2026-05-01T00:00:00.000Z",
          renewsAt: "2026-05-01T00:00:00.000Z",
        },
        entitlements: {
          maxBranches: 3,
          maxInternalUsers: 18,
          bookingWebsiteEnabled: true,
          enabledModules: ["appointments", "inventory", "analytics"],
        },
      },
    });

    createdTenantIds.push(result.tenant.id);

    expect(result).toMatchObject({
      tenant: {
        slug: expect.stringMatching(/^tenant-/),
        displayName: "North Star Spa",
        status: "provisioning",
        owner: {
          fullName: "Maya Hassan",
          phoneNumber: "+201234567890",
          email: "maya@northstar.test",
          status: "invited",
          onboardingLinkStatus: "issued",
        },
        subscription: {
          planCode: "growth",
          amountMinor: 125000,
          currencyCode: "USD",
        },
        entitlements: {
          maxBranches: 3,
          maxInternalUsers: 18,
          bookingWebsiteEnabled: true,
          enabledModules: ["appointments", "inventory", "analytics"],
        },
      },
      ownerOnboardingLink: {
        activationToken: expect.any(String),
        activationPath: expect.stringMatching(/^\/owner-activation\//),
      },
    });
    expect(result.tenant.lifecycle.map((event) => event.eventType)).toEqual(
      expect.arrayContaining([
        "tenant_created",
        "subscription_initialized",
        "entitlements_initialized",
        "owner_invited",
      ]),
    );
    expect(result.tenant.lifecycle).toHaveLength(4);

    const [owner] = await adminDb
      .select()
      .from(tenantOwners)
      .where(eq(tenantOwners.tenantId, result.tenant.id));
    const [onboardingLink] = await adminDb
      .select()
      .from(tenantOnboardingLinks)
      .where(eq(tenantOnboardingLinks.tenantOwnerId, owner!.id));

    expect(owner?.authSubjectId).toBeNull();
    expect(onboardingLink?.tokenHash).toEqual(expect.any(String));
    expect(onboardingLink?.tokenHash).not.toBe(result.ownerOnboardingLink.activationToken);
    expect(onboardingLink?.expiresAt.toISOString()).toBe(result.ownerOnboardingLink.expiresAt);

    const lifecycle = await adminDb
      .select()
      .from(tenantLifecycleEvents)
      .where(eq(tenantLifecycleEvents.tenantId, result.tenant.id))
      .orderBy(desc(tenantLifecycleEvents.occurredAt));

    expect(lifecycle).toHaveLength(4);
  });

  it("reissues onboarding links by revoking the prior active link and appending lifecycle history", async () => {
    const platformAdminSubjectId = await seedInternalSubject(
      `platform-admin+${randomUUID()}@vision.test`,
      "platform_admin",
    );
    createdSubjectIds.push(platformAdminSubjectId);

    const created = await service.createTenant({
      actorSubjectId: platformAdminSubjectId,
      payload: {
        tenant: {
          slug: `tenant-${randomUUID().slice(0, 8)}`,
          displayName: "Aurora Wellness",
        },
        owner: {
          fullName: "Noor Adel",
          phoneNumber: "+201111111111",
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

    const reissued = await service.issueOwnerOnboardingLink({
      actorSubjectId: platformAdminSubjectId,
      tenantId: created.tenant.id,
    });

    expect(reissued.linkId).not.toBe(created.ownerOnboardingLink.linkId);
    expect(reissued.activationToken).not.toBe(created.ownerOnboardingLink.activationToken);

    const ownerLinks = await adminDb
      .select()
      .from(tenantOnboardingLinks)
      .orderBy(desc(tenantOnboardingLinks.issuedAt));
    const activeLink = ownerLinks.find((link) => link.id === reissued.linkId);
    const revokedLink = ownerLinks.find((link) => link.id !== reissued.linkId);

    expect(ownerLinks).toHaveLength(2);
    expect(activeLink).toMatchObject({
      id: reissued.linkId,
      revokedAt: null,
      revocationReason: null,
    });
    expect(revokedLink?.revokedAt).not.toBeNull();
    expect(revokedLink?.revocationReason).toBe("reissued");

    const detail = await service.getTenantDetail({
      tenantId: created.tenant.id,
    });

    expect(detail.owner.onboardingLinkStatus).toBe("issued");
    expect(detail.lifecycle.map((event) => event.eventType)).toContain("owner_invite_reissued");
  });

  it("suspends tenants by revoking active owner sessions and active onboarding links in the same backend flow", async () => {
    const platformAdminSubjectId = await seedInternalSubject(
      `platform-admin+${randomUUID()}@vision.test`,
      "platform_admin",
    );
    const ownerSubjectId = await seedInternalSubject(
      `owner+${randomUUID()}@vision.test`,
      "tenant_owner",
    );
    createdSubjectIds.push(platformAdminSubjectId, ownerSubjectId);

    const created = await service.createTenant({
      actorSubjectId: platformAdminSubjectId,
      payload: {
        tenant: {
          slug: `tenant-${randomUUID().slice(0, 8)}`,
          displayName: "Elm House Clinic",
        },
        owner: {
          fullName: "Karim Farouk",
          phoneNumber: "+201999999999",
        },
        subscription: {
          planCode: "growth",
          billingInterval: "yearly",
          renewalMode: "auto",
          status: "active",
          amountMinor: 900000,
          currencyCode: "USD",
          currentPeriodStartAt: "2026-04-01T00:00:00.000Z",
          currentPeriodEndAt: "2027-04-01T00:00:00.000Z",
          renewsAt: "2027-04-01T00:00:00.000Z",
        },
        entitlements: {
          maxBranches: 5,
          maxInternalUsers: 30,
          bookingWebsiteEnabled: true,
          enabledModules: ["appointments", "pos"],
        },
      },
    });
    createdTenantIds.push(created.tenant.id);

    const [owner] = await adminDb
      .select()
      .from(tenantOwners)
      .where(eq(tenantOwners.tenantId, created.tenant.id));
    const ownerSessionId = await seedInternalSession(ownerSubjectId);
    createdSessionIds.push(ownerSessionId);

    await adminDb
      .update(tenantOwners)
      .set({
        authSubjectId: ownerSubjectId,
        status: "activated",
        activatedAt: FIXED_TEST_TIME,
        updatedAt: FIXED_TEST_TIME,
      })
      .where(eq(tenantOwners.id, owner!.id));

    const suspended = await service.suspendTenant({
      actorSubjectId: platformAdminSubjectId,
      tenantId: created.tenant.id,
    });

    expect(suspended.status).toBe("suspended");
    expect(suspended.owner.onboardingLinkStatus).toBe("revoked");
    expect(suspended.lifecycle.map((event) => event.eventType)).toContain("tenant_suspended");

    const [session] = await adminDb
      .select()
      .from(authSessions)
      .where(eq(authSessions.id, ownerSessionId));
    expect(session?.revokedAt).not.toBeNull();
    expect(session?.revocationReason).toBe("tenant_suspended");

    const revokedEvents = await adminDb
      .select()
      .from(authAccountEvents)
      .where(eq(authAccountEvents.sessionId, ownerSessionId));
    expect(revokedEvents.find((event) => event.eventType === "session_revoked")).toMatchObject({
      detail: "tenant_suspended",
    });

    const [revokedLink] = await adminDb
      .select()
      .from(tenantOnboardingLinks)
      .where(eq(tenantOnboardingLinks.tenantOwnerId, owner!.id))
      .orderBy(desc(tenantOnboardingLinks.issuedAt));
    expect(revokedLink?.revokedAt).not.toBeNull();
    expect(revokedLink?.revocationReason).toBe("manually_revoked");
  });
});
