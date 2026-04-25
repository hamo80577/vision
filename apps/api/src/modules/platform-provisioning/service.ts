import { randomBytes, randomUUID } from "node:crypto";

import {
  platformEntitlementModuleCodes,
  type CreateTenantInput,
  type CreateTenantResult,
  type IssuedOwnerOnboardingLink,
  type PlatformTenantDetail,
  type PlatformTenantSummary,
  type TenantLifecycleEvent,
  type UpdateTenantEntitlementsInput,
  type UpdateTenantSubscriptionInput,
} from "@vision/contracts";
import { type VisionDatabase } from "@vision/db";

import {
  deriveOnboardingLinkStatus,
  hashOnboardingActivationToken,
} from "./onboarding-links";
import { PlatformProvisioningError } from "./errors";
import {
  createPlatformProvisioningRepository,
  type PlatformProvisioningRepository,
  type TenantRecord,
} from "./repository";

const DEFAULT_ONBOARDING_LINK_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const DEFAULT_OWNER_ACTIVATION_PATH_PREFIX = "/owner-activation";

const MODULE_CODE_ORDER = new Map<string, number>(
  platformEntitlementModuleCodes.map((code, index) => [code, index]),
);

type PlatformProvisioningActor = {
  actorSubjectId: string;
};

type PlatformProvisioningServiceOptions = {
  db: VisionDatabase;
  now?: () => Date;
  onboardingLinkTtlMs?: number;
  ownerActivationPathPrefix?: string;
  repository?: PlatformProvisioningRepository;
};

function normalizePhoneNumber(value: string): string {
  return value.trim();
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

function sortEnabledModules(
  moduleCodes: string[],
): PlatformTenantSummary["entitlements"]["enabledModules"] {
  return [...moduleCodes]
    .sort((left, right) => {
      const leftOrder = MODULE_CODE_ORDER.get(left) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = MODULE_CODE_ORDER.get(right) ?? Number.MAX_SAFE_INTEGER;

      return leftOrder - rightOrder || left.localeCompare(right);
    })
    .map(
      (moduleCode) => moduleCode as PlatformTenantSummary["entitlements"]["enabledModules"][number],
    );
}

function mapLifecycle(lifecycle: TenantRecord["lifecycle"]): TenantLifecycleEvent[] {
  return lifecycle.map((event) => ({
    id: event.id,
    eventType: event.eventType,
    actorType: event.actorType,
    actorSubjectId: event.actorSubjectId ?? null,
    occurredAt: event.occurredAt.toISOString(),
  }));
}

function mapTenantSummary(record: TenantRecord, referenceTime: Date): PlatformTenantSummary {
  return {
    id: record.tenant.id,
    slug: record.tenant.slug,
    displayName: record.tenant.displayName,
    status: record.tenant.status,
    statusChangedAt: record.tenant.statusChangedAt.toISOString(),
    owner: {
      fullName: record.owner.fullName,
      phoneNumber: record.owner.phoneNumber,
      email: record.owner.email ?? null,
      status: record.owner.status,
      onboardingLinkStatus: deriveOnboardingLinkStatus(record.latestOnboardingLink, referenceTime),
      onboardingIssuedAt: record.latestOnboardingLink?.issuedAt.toISOString() ?? null,
      onboardingExpiresAt: record.latestOnboardingLink?.expiresAt.toISOString() ?? null,
    },
    subscription: {
      planCode: record.subscription.planCode,
      billingInterval: record.subscription.billingInterval,
      renewalMode: record.subscription.renewalMode,
      status: record.subscription.status,
      amountMinor: record.subscription.amountMinor,
      currencyCode: record.subscription.currencyCode,
      currentPeriodStartAt: record.subscription.currentPeriodStartAt.toISOString(),
      currentPeriodEndAt: record.subscription.currentPeriodEndAt.toISOString(),
      renewsAt: record.subscription.renewsAt?.toISOString() ?? null,
    },
    entitlements: {
      maxBranches: record.entitlements.maxBranches,
      maxInternalUsers: record.entitlements.maxInternalUsers,
      bookingWebsiteEnabled: record.entitlements.bookingWebsiteEnabled,
      enabledModules: sortEnabledModules(record.enabledModules.map((entry) => entry.moduleCode)),
    },
  };
}

function mapTenantDetail(record: TenantRecord, referenceTime: Date): PlatformTenantDetail {
  return {
    ...mapTenantSummary(record, referenceTime),
    lifecycle: mapLifecycle(record.lifecycle),
  };
}

function createOnboardingLinkArtifact(input: {
  ownerActivationPathPrefix: string;
  issuedAt: Date;
  ttlMs: number;
}): {
  databaseLink: {
    id: string;
    tokenHash: string;
    issuedAt: Date;
    expiresAt: Date;
  };
  clientLink: IssuedOwnerOnboardingLink;
} {
  const activationToken = randomBytes(32).toString("base64url");
  const activationPath = `${input.ownerActivationPathPrefix}/${encodeURIComponent(
    activationToken,
  )}`;
  const linkId = `tol_${randomUUID()}`;
  const expiresAt = new Date(input.issuedAt.getTime() + input.ttlMs);

  return {
    databaseLink: {
      id: linkId,
      tokenHash: hashOnboardingActivationToken(activationToken),
      issuedAt: input.issuedAt,
      expiresAt,
    },
    clientLink: {
      linkId,
      activationToken,
      activationPath,
      issuedAt: input.issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    },
  };
}

function ensureTenantRecord(record: TenantRecord | null): TenantRecord {
  if (!record) {
    throw new PlatformProvisioningError("tenant_not_found");
  }

  return record;
}

function mapConflict(error: unknown): never {
  if (isUniqueViolation(error)) {
    throw new PlatformProvisioningError("tenant_conflict");
  }

  throw error;
}

export function createPlatformProvisioningService(options: PlatformProvisioningServiceOptions) {
  const now = options.now ?? (() => new Date());
  const onboardingLinkTtlMs = options.onboardingLinkTtlMs ?? DEFAULT_ONBOARDING_LINK_TTL_MS;
  const ownerActivationPathPrefix =
    options.ownerActivationPathPrefix ?? DEFAULT_OWNER_ACTIVATION_PATH_PREFIX;
  const repository = options.repository ?? createPlatformProvisioningRepository(options.db);

  return {
    async listTenants(): Promise<PlatformTenantSummary[]> {
      const referenceTime = now();
      const records = await repository.listTenantRecords();

      return records.map((record) => mapTenantSummary(record, referenceTime));
    },

    async getTenantDetail(input: { tenantId: string }): Promise<PlatformTenantDetail> {
      const record = ensureTenantRecord(
        await repository.loadTenantRecord(input.tenantId, {
          includeLifecycle: true,
        }),
      );

      return mapTenantDetail(record, now());
    },

    async createTenant(
      input: PlatformProvisioningActor & { payload: CreateTenantInput },
    ): Promise<CreateTenantResult> {
      const currentTime = now();
      const tenantId = `tenant_${randomUUID()}`;
      const tenantOwnerId = `tno_${randomUUID()}`;
      const subscriptionId = `tsu_${randomUUID()}`;
      const entitlementsId = `ten_${randomUUID()}`;
      const onboardingLink = createOnboardingLinkArtifact({
        ownerActivationPathPrefix,
        issuedAt: currentTime,
        ttlMs: onboardingLinkTtlMs,
      });

      try {
        return await repository.transaction(async (txRepository) => {
          await txRepository.insertTenant({
            id: tenantId,
            slug: input.payload.tenant.slug,
            displayName: input.payload.tenant.displayName,
            status: "provisioning",
            statusChangedAt: currentTime,
            createdAt: currentTime,
            updatedAt: currentTime,
          });

          await txRepository.insertTenantOwner({
            id: tenantOwnerId,
            tenantId,
            fullName: input.payload.owner.fullName,
            phoneNumber: input.payload.owner.phoneNumber,
            normalizedPhoneNumber: normalizePhoneNumber(input.payload.owner.phoneNumber),
            email: input.payload.owner.email ?? null,
            status: "invited",
            invitedAt: currentTime,
            createdAt: currentTime,
            updatedAt: currentTime,
          });

          await txRepository.insertSubscription({
            id: subscriptionId,
            tenantId,
            planCode: input.payload.subscription.planCode,
            billingInterval: input.payload.subscription.billingInterval,
            renewalMode: input.payload.subscription.renewalMode,
            status: input.payload.subscription.status,
            amountMinor: input.payload.subscription.amountMinor,
            currencyCode: input.payload.subscription.currencyCode,
            currentPeriodStartAt: new Date(input.payload.subscription.currentPeriodStartAt),
            currentPeriodEndAt: new Date(input.payload.subscription.currentPeriodEndAt),
            renewsAt: input.payload.subscription.renewsAt
              ? new Date(input.payload.subscription.renewsAt)
              : null,
            createdAt: currentTime,
            updatedAt: currentTime,
          });

          await txRepository.insertEntitlements({
            id: entitlementsId,
            tenantId,
            maxBranches: input.payload.entitlements.maxBranches,
            maxInternalUsers: input.payload.entitlements.maxInternalUsers,
            bookingWebsiteEnabled: input.payload.entitlements.bookingWebsiteEnabled,
            createdAt: currentTime,
            updatedAt: currentTime,
          });

          await txRepository.replaceEnabledModules(
            tenantId,
            input.payload.entitlements.enabledModules,
          );

          await txRepository.insertOnboardingLink({
            id: onboardingLink.databaseLink.id,
            tenantOwnerId,
            tokenHash: onboardingLink.databaseLink.tokenHash,
            issuedAt: onboardingLink.databaseLink.issuedAt,
            expiresAt: onboardingLink.databaseLink.expiresAt,
            createdAt: currentTime,
          });

          await txRepository.insertLifecycleEvents([
            {
              id: `tle_${randomUUID()}`,
              tenantId,
              actorType: "platform_admin",
              actorSubjectId: input.actorSubjectId,
              eventType: "tenant_created",
              detail: {
                tenantSlug: input.payload.tenant.slug,
              },
              occurredAt: currentTime,
              createdAt: currentTime,
            },
            {
              id: `tle_${randomUUID()}`,
              tenantId,
              actorType: "platform_admin",
              actorSubjectId: input.actorSubjectId,
              eventType: "subscription_initialized",
              detail: {
                planCode: input.payload.subscription.planCode,
                subscriptionStatus: input.payload.subscription.status,
                amountMinor: input.payload.subscription.amountMinor,
              },
              occurredAt: currentTime,
              createdAt: currentTime,
            },
            {
              id: `tle_${randomUUID()}`,
              tenantId,
              actorType: "platform_admin",
              actorSubjectId: input.actorSubjectId,
              eventType: "entitlements_initialized",
              detail: {
                maxBranches: input.payload.entitlements.maxBranches,
                maxInternalUsers: input.payload.entitlements.maxInternalUsers,
                bookingWebsiteEnabled: input.payload.entitlements.bookingWebsiteEnabled,
                enabledModules: input.payload.entitlements.enabledModules.join(",") || null,
              },
              occurredAt: currentTime,
              createdAt: currentTime,
            },
            {
              id: `tle_${randomUUID()}`,
              tenantId,
              actorType: "platform_admin",
              actorSubjectId: input.actorSubjectId,
              eventType: "owner_invited",
              detail: {
                tenantOwnerId,
                onboardingLinkId: onboardingLink.databaseLink.id,
              },
              occurredAt: currentTime,
              createdAt: currentTime,
            },
          ]);

          const createdRecord = ensureTenantRecord(
            await txRepository.loadTenantRecord(tenantId, {
              includeLifecycle: true,
            }),
          );

          return {
            tenant: mapTenantDetail(createdRecord, currentTime),
            ownerOnboardingLink: onboardingLink.clientLink,
          };
        });
      } catch (error) {
        mapConflict(error);
      }
    },

    async updateTenantSubscription(
      input: PlatformProvisioningActor & {
        tenantId: string;
        payload: UpdateTenantSubscriptionInput;
      },
    ): Promise<PlatformTenantDetail> {
      const currentTime = now();

      return repository.transaction(async (txRepository) => {
        ensureTenantRecord(await txRepository.loadTenantRecord(input.tenantId));

        await txRepository.updateSubscription(input.tenantId, {
          planCode: input.payload.planCode,
          billingInterval: input.payload.billingInterval,
          renewalMode: input.payload.renewalMode,
          status: input.payload.status,
          amountMinor: input.payload.amountMinor,
          currencyCode: input.payload.currencyCode,
          currentPeriodStartAt: new Date(input.payload.currentPeriodStartAt),
          currentPeriodEndAt: new Date(input.payload.currentPeriodEndAt),
          renewsAt: input.payload.renewsAt ? new Date(input.payload.renewsAt) : null,
          updatedAt: currentTime,
        });

        await txRepository.insertLifecycleEvents([
          {
            id: `tle_${randomUUID()}`,
            tenantId: input.tenantId,
            actorType: "platform_admin",
            actorSubjectId: input.actorSubjectId,
            eventType: "subscription_updated",
            detail: {
              planCode: input.payload.planCode,
              subscriptionStatus: input.payload.status,
              amountMinor: input.payload.amountMinor,
            },
            occurredAt: currentTime,
            createdAt: currentTime,
          },
        ]);

        const updatedRecord = ensureTenantRecord(
          await txRepository.loadTenantRecord(input.tenantId, {
            includeLifecycle: true,
          }),
        );

        return mapTenantDetail(updatedRecord, currentTime);
      });
    },

    async updateTenantEntitlements(
      input: PlatformProvisioningActor & {
        tenantId: string;
        payload: UpdateTenantEntitlementsInput;
      },
    ): Promise<PlatformTenantDetail> {
      const currentTime = now();

      return repository.transaction(async (txRepository) => {
        ensureTenantRecord(await txRepository.loadTenantRecord(input.tenantId));

        await txRepository.updateEntitlements(input.tenantId, {
          maxBranches: input.payload.maxBranches,
          maxInternalUsers: input.payload.maxInternalUsers,
          bookingWebsiteEnabled: input.payload.bookingWebsiteEnabled,
          updatedAt: currentTime,
        });
        await txRepository.replaceEnabledModules(input.tenantId, input.payload.enabledModules);

        await txRepository.insertLifecycleEvents([
          {
            id: `tle_${randomUUID()}`,
            tenantId: input.tenantId,
            actorType: "platform_admin",
            actorSubjectId: input.actorSubjectId,
            eventType: "entitlements_updated",
            detail: {
              maxBranches: input.payload.maxBranches,
              maxInternalUsers: input.payload.maxInternalUsers,
              bookingWebsiteEnabled: input.payload.bookingWebsiteEnabled,
              enabledModules: input.payload.enabledModules.join(",") || null,
            },
            occurredAt: currentTime,
            createdAt: currentTime,
          },
        ]);

        const updatedRecord = ensureTenantRecord(
          await txRepository.loadTenantRecord(input.tenantId, {
            includeLifecycle: true,
          }),
        );

        return mapTenantDetail(updatedRecord, currentTime);
      });
    },

    async activateTenant(
      input: PlatformProvisioningActor & { tenantId: string },
    ): Promise<PlatformTenantDetail> {
      const currentTime = now();

      return repository.transaction(async (txRepository) => {
        const tenantRecord = ensureTenantRecord(
          await txRepository.loadTenantRecord(input.tenantId),
        );

        if (tenantRecord.owner.status !== "activated") {
          throw new PlatformProvisioningError(
            "tenant_conflict",
            "Cannot activate a tenant before the owner completes activation.",
          );
        }

        if (tenantRecord.tenant.status !== "active") {
          await txRepository.updateTenantStatus(input.tenantId, {
            status: "active",
            statusChangedAt: currentTime,
            updatedAt: currentTime,
          });
          await txRepository.insertLifecycleEvents([
            {
              id: `tle_${randomUUID()}`,
              tenantId: input.tenantId,
              actorType: "platform_admin",
              actorSubjectId: input.actorSubjectId,
              eventType: "tenant_activated",
              detail: {},
              occurredAt: currentTime,
              createdAt: currentTime,
            },
          ]);
        }

        const updatedRecord = ensureTenantRecord(
          await txRepository.loadTenantRecord(input.tenantId, {
            includeLifecycle: true,
          }),
        );

        return mapTenantDetail(updatedRecord, currentTime);
      });
    },

    async suspendTenant(
      input: PlatformProvisioningActor & { tenantId: string },
    ): Promise<PlatformTenantDetail> {
      const currentTime = now();

      return repository.transaction(async (txRepository) => {
        const tenantRecord = ensureTenantRecord(
          await txRepository.loadTenantRecord(input.tenantId),
        );

        if (tenantRecord.tenant.status !== "suspended") {
          await txRepository.updateTenantStatus(input.tenantId, {
            status: "suspended",
            statusChangedAt: currentTime,
            updatedAt: currentTime,
          });
          await txRepository.revokeActiveOnboardingLinks({
            tenantOwnerId: tenantRecord.owner.id,
            revokedAt: currentTime,
            revocationReason: "manually_revoked",
            activeAfter: currentTime,
          });

          if (tenantRecord.owner.authSubjectId) {
            const activeSessions = await txRepository.listActiveSessionsBySubjectId(
              tenantRecord.owner.authSubjectId,
              currentTime,
            );
            const sessionIds = activeSessions.map((session) => session.id);

            await txRepository.revokeSessions(sessionIds, {
              revokedAt: currentTime,
              revocationReason: "tenant_suspended",
              updatedAt: currentTime,
            });
            await txRepository.insertAuthAccountEvents(
              activeSessions.map((session) => ({
                id: `evt_${randomUUID()}`,
                subjectId: session.subjectId,
                sessionId: session.id,
                subjectType: session.subjectType,
                eventType: "session_revoked",
                detail: "tenant_suspended",
                occurredAt: currentTime,
              })),
            );
          }

          await txRepository.insertLifecycleEvents([
            {
              id: `tle_${randomUUID()}`,
              tenantId: input.tenantId,
              actorType: "platform_admin",
              actorSubjectId: input.actorSubjectId,
              eventType: "tenant_suspended",
              detail: {},
              occurredAt: currentTime,
              createdAt: currentTime,
            },
          ]);
        }

        const updatedRecord = ensureTenantRecord(
          await txRepository.loadTenantRecord(input.tenantId, {
            includeLifecycle: true,
          }),
        );

        return mapTenantDetail(updatedRecord, currentTime);
      });
    },

    async issueOwnerOnboardingLink(
      input: PlatformProvisioningActor & { tenantId: string },
    ): Promise<IssuedOwnerOnboardingLink> {
      const currentTime = now();
      const linkIssuedAt = new Date(currentTime.getTime() + 1);
      const onboardingLink = createOnboardingLinkArtifact({
        ownerActivationPathPrefix,
        issuedAt: linkIssuedAt,
        ttlMs: onboardingLinkTtlMs,
      });

      return repository.transaction(async (txRepository) => {
        const tenantRecord = ensureTenantRecord(
          await txRepository.loadTenantRecord(input.tenantId),
        );

        if (tenantRecord.tenant.status === "suspended") {
          throw new PlatformProvisioningError(
            "tenant_conflict",
            "Cannot issue onboarding links for a suspended tenant.",
          );
        }

        await txRepository.revokeActiveOnboardingLinks({
          tenantOwnerId: tenantRecord.owner.id,
          revokedAt: currentTime,
          revocationReason: "reissued",
          activeAfter: currentTime,
        });
        await txRepository.insertOnboardingLink({
          id: onboardingLink.databaseLink.id,
          tenantOwnerId: tenantRecord.owner.id,
          tokenHash: onboardingLink.databaseLink.tokenHash,
          issuedAt: onboardingLink.databaseLink.issuedAt,
          expiresAt: onboardingLink.databaseLink.expiresAt,
          createdAt: currentTime,
        });
        await txRepository.insertLifecycleEvents([
          {
            id: `tle_${randomUUID()}`,
            tenantId: input.tenantId,
            actorType: "platform_admin",
            actorSubjectId: input.actorSubjectId,
            eventType: "owner_invite_reissued",
            detail: {
              tenantOwnerId: tenantRecord.owner.id,
              onboardingLinkId: onboardingLink.databaseLink.id,
            },
            occurredAt: currentTime,
            createdAt: currentTime,
          },
        ]);

        return onboardingLink.clientLink;
      });
    },
  };
}

export type PlatformProvisioningService = ReturnType<typeof createPlatformProvisioningService>;
