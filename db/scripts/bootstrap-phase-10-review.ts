import { eq, inArray } from "../../packages/db/node_modules/drizzle-orm";

import { hashPassword, normalizeLoginIdentifier } from "../../packages/authn/src";
import {
  authMfaBackupCodes,
  authMfaTotpFactors,
  authSubjects,
  closeDatabasePool,
  createDatabaseClient,
  createDatabasePool,
  deriveAdminTargetDatabaseUrl,
  getDatabaseAdminConfig,
  getDatabaseRuntimeConfig,
  tenants,
} from "../../packages/db/src";
import { createPlatformProvisioningService } from "../../apps/api/src/modules/platform-provisioning/service";

const REVIEW_LOGIN_IDENTIFIER = "platform.review@vision.test";
const REVIEW_PASSWORD = "S3cure-platform-password!";

const runtimeConfig = getDatabaseRuntimeConfig(process.env);
const adminConfig = getDatabaseAdminConfig(process.env);

if (runtimeConfig.appEnv !== "local" && runtimeConfig.appEnv !== "test") {
  throw new Error("bootstrap-phase-10-review is allowed only in local or test environments");
}

const runtimePool = createDatabasePool(runtimeConfig.databaseUrl);
const runtimeDb = createDatabaseClient(runtimePool);
const adminTargetDatabaseUrl = deriveAdminTargetDatabaseUrl(
  adminConfig.adminDatabaseUrl,
  adminConfig.adminTargetDatabaseName,
);
const adminPool = createDatabasePool(adminTargetDatabaseUrl);
const adminDb = createDatabaseClient(adminPool);

const provisioningService = createPlatformProvisioningService({
  db: runtimeDb,
});

const tenantFixtures = [
  {
    slug: "cedar-stone-spa",
    displayName: "Cedar Stone Spa",
    owner: {
      fullName: "Maya Hassan",
      phoneNumber: "+201111000111",
      email: "maya@cedarstone.test",
    },
    subscription: {
      planCode: "growth",
      billingInterval: "monthly" as const,
      renewalMode: "auto" as const,
      status: "active" as const,
      amountMinor: 245000,
      currencyCode: "USD",
      currentPeriodStartAt: "2026-04-01T00:00:00.000Z",
      currentPeriodEndAt: "2026-05-01T00:00:00.000Z",
      renewsAt: "2026-05-01T00:00:00.000Z",
    },
    entitlements: {
      maxBranches: 3,
      maxInternalUsers: 16,
      bookingWebsiteEnabled: true,
      enabledModules: ["appointments", "analytics"] as const,
    },
    afterCreate: "leave_provisioning" as const,
  },
  {
    slug: "lumen-clinic",
    displayName: "Lumen Clinic",
    owner: {
      fullName: "Salma Nabil",
      phoneNumber: "+201111000222",
      email: "salma@lumenclinic.test",
    },
    subscription: {
      planCode: "starter",
      billingInterval: "monthly" as const,
      renewalMode: "manual" as const,
      status: "trialing" as const,
      amountMinor: 0,
      currencyCode: "USD",
      currentPeriodStartAt: "2026-04-01T00:00:00.000Z",
      currentPeriodEndAt: "2026-05-01T00:00:00.000Z",
      renewsAt: null,
    },
    entitlements: {
      maxBranches: 1,
      maxInternalUsers: 6,
      bookingWebsiteEnabled: false,
      enabledModules: ["appointments"] as const,
    },
    afterCreate: "leave_provisioning" as const,
  },
  {
    slug: "atlas-house-studio",
    displayName: "Atlas House Studio",
    owner: {
      fullName: "Noor Adel",
      phoneNumber: "+201111000333",
      email: "noor@atlashouse.test",
    },
    subscription: {
      planCode: "scale",
      billingInterval: "yearly" as const,
      renewalMode: "auto" as const,
      status: "past_due" as const,
      amountMinor: 980000,
      currencyCode: "USD",
      currentPeriodStartAt: "2026-01-01T00:00:00.000Z",
      currentPeriodEndAt: "2027-01-01T00:00:00.000Z",
      renewsAt: "2027-01-01T00:00:00.000Z",
    },
    entitlements: {
      maxBranches: 5,
      maxInternalUsers: 28,
      bookingWebsiteEnabled: true,
      enabledModules: ["appointments", "pos", "inventory", "analytics"] as const,
    },
    afterCreate: "suspend" as const,
  },
];

try {
  const normalizedLoginIdentifier = normalizeLoginIdentifier(REVIEW_LOGIN_IDENTIFIER);
  const passwordHash = await hashPassword(REVIEW_PASSWORD);

  const [existingSubject] = await adminDb
    .select()
    .from(authSubjects)
    .where(eq(authSubjects.normalizedLoginIdentifier, normalizedLoginIdentifier))
    .limit(1);

  const subjectId = existingSubject?.id ?? "sub_phase10_review_admin";

  if (existingSubject) {
    await adminDb
      .update(authSubjects)
      .set({
        loginIdentifier: REVIEW_LOGIN_IDENTIFIER,
        normalizedLoginIdentifier,
        passwordHash,
        internalSensitivity: "platform_admin",
        isEnabled: true,
      })
      .where(eq(authSubjects.id, subjectId));

    await adminDb.delete(authMfaBackupCodes).where(eq(authMfaBackupCodes.subjectId, subjectId));
    await adminDb.delete(authMfaTotpFactors).where(eq(authMfaTotpFactors.subjectId, subjectId));
  } else {
    await adminDb.insert(authSubjects).values({
      id: subjectId,
      subjectType: "internal",
      loginIdentifier: REVIEW_LOGIN_IDENTIFIER,
      normalizedLoginIdentifier,
      passwordHash,
      internalSensitivity: "platform_admin",
      isEnabled: true,
    });
  }

  const existingTenants = await adminDb
    .select({
      id: tenants.id,
      slug: tenants.slug,
    })
    .from(tenants)
    .where(inArray(tenants.slug, tenantFixtures.map((fixture) => fixture.slug)));
  const existingSlugs = new Set(existingTenants.map((tenant) => tenant.slug));

  for (const fixture of tenantFixtures) {
    if (existingSlugs.has(fixture.slug)) {
      continue;
    }

    const created = await provisioningService.createTenant({
      actorSubjectId: subjectId,
      payload: {
        tenant: {
          slug: fixture.slug,
          displayName: fixture.displayName,
        },
        owner: fixture.owner,
        subscription: fixture.subscription,
        entitlements: {
          ...fixture.entitlements,
          enabledModules: [...fixture.entitlements.enabledModules],
        },
      },
    });

    if (fixture.afterCreate === "activate") {
      await provisioningService.activateTenant({
        actorSubjectId: subjectId,
        tenantId: created.tenant.id,
      });
    }

    if (fixture.afterCreate === "suspend") {
      await provisioningService.suspendTenant({
        actorSubjectId: subjectId,
        tenantId: created.tenant.id,
      });
    }
  }

  console.log("Phase 10 review data ready.");
  console.log(`Login identifier: ${REVIEW_LOGIN_IDENTIFIER}`);
  console.log(`Password: ${REVIEW_PASSWORD}`);
  console.log(`Seeded tenants: ${tenantFixtures.map((fixture) => fixture.slug).join(", ")}`);
} finally {
  await closeDatabasePool(runtimePool);
  await closeDatabasePool(adminPool);
}
