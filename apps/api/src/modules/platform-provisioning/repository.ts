import { and, desc, eq, gt, inArray, isNull } from "drizzle-orm";

import {
  authAccountEvents,
  authSessions,
  tenantEnabledModules,
  tenantEntitlements,
  tenantLifecycleEvents,
  tenantOnboardingLinks,
  tenantOwners,
  tenants,
  tenantSubscriptions,
  type VisionDatabase,
  withDatabaseTransaction,
} from "@vision/db";

type DatabaseExecutor = Pick<VisionDatabase, "delete" | "insert" | "select" | "update">;

type TenantRow = typeof tenants.$inferSelect;
type TenantOwnerRow = typeof tenantOwners.$inferSelect;
type TenantSubscriptionRow = typeof tenantSubscriptions.$inferSelect;
type TenantEntitlementsRow = typeof tenantEntitlements.$inferSelect;
type TenantEnabledModuleRow = typeof tenantEnabledModules.$inferSelect;
type TenantOnboardingLinkRow = typeof tenantOnboardingLinks.$inferSelect;
type TenantLifecycleEventRow = typeof tenantLifecycleEvents.$inferSelect;
type AuthSessionRow = typeof authSessions.$inferSelect;
type AuthAccountEventInsert = typeof authAccountEvents.$inferInsert;
type TenantInsert = typeof tenants.$inferInsert;
type TenantOwnerInsert = typeof tenantOwners.$inferInsert;
type TenantSubscriptionInsert = typeof tenantSubscriptions.$inferInsert;
type TenantEntitlementsInsert = typeof tenantEntitlements.$inferInsert;
type TenantOnboardingLinkInsert = typeof tenantOnboardingLinks.$inferInsert;
type TenantLifecycleEventInsert = typeof tenantLifecycleEvents.$inferInsert;
type AuthSessionInsert = typeof authSessions.$inferInsert;

type TenantBaseRow = {
  tenant: TenantRow;
  owner: TenantOwnerRow;
  subscription: TenantSubscriptionRow;
  entitlements: TenantEntitlementsRow;
};

export type TenantRecord = TenantBaseRow & {
  enabledModules: TenantEnabledModuleRow[];
  latestOnboardingLink: TenantOnboardingLinkRow | null;
  lifecycle: TenantLifecycleEventRow[];
};

function takeLatestLinkByOwner(
  links: TenantOnboardingLinkRow[],
): Map<string, TenantOnboardingLinkRow> {
  const latestLinks = new Map<string, TenantOnboardingLinkRow>();

  for (const link of links) {
    if (!latestLinks.has(link.tenantOwnerId)) {
      latestLinks.set(link.tenantOwnerId, link);
    }
  }

  return latestLinks;
}

function groupModulesByTenant(
  modules: TenantEnabledModuleRow[],
): Map<string, TenantEnabledModuleRow[]> {
  const grouped = new Map<string, TenantEnabledModuleRow[]>();

  for (const moduleAssignment of modules) {
    const tenantModules = grouped.get(moduleAssignment.tenantId) ?? [];
    tenantModules.push(moduleAssignment);
    grouped.set(moduleAssignment.tenantId, tenantModules);
  }

  return grouped;
}

function createRepositoryForExecutor(executor: DatabaseExecutor) {
  async function listTenantBaseRows(): Promise<TenantBaseRow[]> {
    return executor
      .select({
        tenant: tenants,
        owner: tenantOwners,
        subscription: tenantSubscriptions,
        entitlements: tenantEntitlements,
      })
      .from(tenants)
      .innerJoin(tenantOwners, eq(tenantOwners.tenantId, tenants.id))
      .innerJoin(tenantSubscriptions, eq(tenantSubscriptions.tenantId, tenants.id))
      .innerJoin(tenantEntitlements, eq(tenantEntitlements.tenantId, tenants.id))
      .orderBy(desc(tenants.createdAt));
  }

  async function getTenantBaseRow(tenantId: string): Promise<TenantBaseRow | null> {
    const [row] = await executor
      .select({
        tenant: tenants,
        owner: tenantOwners,
        subscription: tenantSubscriptions,
        entitlements: tenantEntitlements,
      })
      .from(tenants)
      .innerJoin(tenantOwners, eq(tenantOwners.tenantId, tenants.id))
      .innerJoin(tenantSubscriptions, eq(tenantSubscriptions.tenantId, tenants.id))
      .innerJoin(tenantEntitlements, eq(tenantEntitlements.tenantId, tenants.id))
      .where(eq(tenants.id, tenantId))
      .limit(1);

    return row ?? null;
  }

  async function listEnabledModulesByTenantIds(
    tenantIds: string[],
  ): Promise<TenantEnabledModuleRow[]> {
    if (tenantIds.length === 0) {
      return [];
    }

    return executor
      .select()
      .from(tenantEnabledModules)
      .where(inArray(tenantEnabledModules.tenantId, tenantIds));
  }

  async function listOnboardingLinksByOwnerIds(
    ownerIds: string[],
  ): Promise<TenantOnboardingLinkRow[]> {
    if (ownerIds.length === 0) {
      return [];
    }

    return executor
      .select()
      .from(tenantOnboardingLinks)
      .where(inArray(tenantOnboardingLinks.tenantOwnerId, ownerIds))
      .orderBy(desc(tenantOnboardingLinks.issuedAt));
  }

  async function listLifecycleEventsByTenantId(
    tenantId: string,
  ): Promise<TenantLifecycleEventRow[]> {
    return executor
      .select()
      .from(tenantLifecycleEvents)
      .where(eq(tenantLifecycleEvents.tenantId, tenantId))
      .orderBy(desc(tenantLifecycleEvents.occurredAt));
  }

  async function loadTenantRecord(
    tenantId: string,
    options: { includeLifecycle?: boolean } = {},
  ): Promise<TenantRecord | null> {
    const baseRow = await getTenantBaseRow(tenantId);

    if (!baseRow) {
      return null;
    }

    const [modules, links, lifecycle] = await Promise.all([
      listEnabledModulesByTenantIds([tenantId]),
      listOnboardingLinksByOwnerIds([baseRow.owner.id]),
      options.includeLifecycle ? listLifecycleEventsByTenantId(tenantId) : Promise.resolve([]),
    ]);

    return {
      ...baseRow,
      enabledModules: modules,
      latestOnboardingLink: links[0] ?? null,
      lifecycle,
    };
  }

  async function listTenantRecords(): Promise<TenantRecord[]> {
    const baseRows = await listTenantBaseRows();

    if (baseRows.length === 0) {
      return [];
    }

    const tenantIds = baseRows.map((row) => row.tenant.id);
    const ownerIds = baseRows.map((row) => row.owner.id);
    const [modules, links] = await Promise.all([
      listEnabledModulesByTenantIds(tenantIds),
      listOnboardingLinksByOwnerIds(ownerIds),
    ]);

    const modulesByTenantId = groupModulesByTenant(modules);
    const latestLinksByOwnerId = takeLatestLinkByOwner(links);

    return baseRows.map((row) => ({
      ...row,
      enabledModules: modulesByTenantId.get(row.tenant.id) ?? [],
      latestOnboardingLink: latestLinksByOwnerId.get(row.owner.id) ?? null,
      lifecycle: [],
    }));
  }

  return {
    async insertTenant(values: TenantInsert) {
      await executor.insert(tenants).values(values);
    },

    async insertTenantOwner(values: TenantOwnerInsert) {
      await executor.insert(tenantOwners).values(values);
    },

    async updateTenantOwner(tenantOwnerId: string, values: Partial<TenantOwnerInsert>) {
      await executor.update(tenantOwners).set(values).where(eq(tenantOwners.id, tenantOwnerId));
    },

    async insertSubscription(values: TenantSubscriptionInsert) {
      await executor.insert(tenantSubscriptions).values(values);
    },

    async updateSubscription(tenantId: string, values: Partial<TenantSubscriptionInsert>) {
      await executor
        .update(tenantSubscriptions)
        .set(values)
        .where(eq(tenantSubscriptions.tenantId, tenantId));
    },

    async insertEntitlements(values: TenantEntitlementsInsert) {
      await executor.insert(tenantEntitlements).values(values);
    },

    async updateEntitlements(tenantId: string, values: Partial<TenantEntitlementsInsert>) {
      await executor
        .update(tenantEntitlements)
        .set(values)
        .where(eq(tenantEntitlements.tenantId, tenantId));
    },

    async replaceEnabledModules(tenantId: string, moduleCodes: string[]) {
      await executor
        .delete(tenantEnabledModules)
        .where(eq(tenantEnabledModules.tenantId, tenantId));

      if (moduleCodes.length === 0) {
        return;
      }

      await executor.insert(tenantEnabledModules).values(
        moduleCodes.map((moduleCode) => ({
          tenantId,
          moduleCode: moduleCode as TenantEnabledModuleRow["moduleCode"],
        })),
      );
    },

    async insertOnboardingLink(values: TenantOnboardingLinkInsert) {
      await executor.insert(tenantOnboardingLinks).values(values);
    },

    async revokeActiveOnboardingLinks(input: {
      tenantOwnerId: string;
      revokedAt: Date;
      revocationReason: TenantOnboardingLinkInsert["revocationReason"];
      activeAfter: Date;
    }) {
      await executor
        .update(tenantOnboardingLinks)
        .set({
          revokedAt: input.revokedAt,
          revocationReason: input.revocationReason,
        })
        .where(
          and(
            eq(tenantOnboardingLinks.tenantOwnerId, input.tenantOwnerId),
            isNull(tenantOnboardingLinks.revokedAt),
            isNull(tenantOnboardingLinks.consumedAt),
            gt(tenantOnboardingLinks.expiresAt, input.activeAfter),
          ),
        );
    },

    async insertLifecycleEvents(values: TenantLifecycleEventInsert[]) {
      if (values.length === 0) {
        return;
      }

      await executor.insert(tenantLifecycleEvents).values(values);
    },

    async updateTenantStatus(
      tenantId: string,
      values: Pick<TenantInsert, "status" | "statusChangedAt" | "updatedAt">,
    ) {
      await executor.update(tenants).set(values).where(eq(tenants.id, tenantId));
    },

    async listActiveSessionsBySubjectId(
      subjectId: string,
      activeAfter: Date,
    ): Promise<AuthSessionRow[]> {
      return executor
        .select()
        .from(authSessions)
        .where(
          and(
            eq(authSessions.subjectId, subjectId),
            isNull(authSessions.revokedAt),
            gt(authSessions.expiresAt, activeAfter),
          ),
        );
    },

    async revokeSessions(
      sessionIds: string[],
      values: Pick<AuthSessionInsert, "revocationReason"> & {
        revokedAt: Date;
        updatedAt: Date;
      },
    ) {
      if (sessionIds.length === 0) {
        return;
      }

      await executor.update(authSessions).set(values).where(inArray(authSessions.id, sessionIds));
    },

    async insertAuthAccountEvents(values: AuthAccountEventInsert[]) {
      if (values.length === 0) {
        return;
      }

      await executor.insert(authAccountEvents).values(values);
    },

    loadTenantRecord,
    listTenantRecords,
  };
}

export function createPlatformProvisioningRepository(db: VisionDatabase) {
  const repository = createRepositoryForExecutor(db);

  return {
    ...repository,
    async transaction<TResult>(
      callback: (txRepository: ReturnType<typeof createRepositoryForExecutor>) => Promise<TResult>,
    ): Promise<TResult> {
      return withDatabaseTransaction(db, async (tx) =>
        callback(createRepositoryForExecutor(tx as unknown as DatabaseExecutor)),
      );
    },
  };
}

export type PlatformProvisioningRepository = ReturnType<
  typeof createPlatformProvisioningRepository
>;
