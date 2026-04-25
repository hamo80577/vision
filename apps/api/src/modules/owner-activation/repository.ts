import { and, eq } from "drizzle-orm";

import {
  authAccountEvents,
  authAssuranceChallenges,
  authSubjects,
  tenantLifecycleEvents,
  tenantOnboardingLinks,
  tenantOwners,
  tenants,
  type VisionDatabase,
  withDatabaseTransaction,
} from "@vision/db";

type DatabaseExecutor = Pick<VisionDatabase, "insert" | "select" | "update">;

type ActivationRecord = {
  onboardingLink: typeof tenantOnboardingLinks.$inferSelect;
  owner: typeof tenantOwners.$inferSelect;
  tenant: typeof tenants.$inferSelect;
};

function createRepositoryForExecutor(executor: DatabaseExecutor) {
  return {
    async getActivationRecordByTokenHash(tokenHash: string): Promise<ActivationRecord | null> {
      const [record] = await executor
        .select({
          onboardingLink: tenantOnboardingLinks,
          owner: tenantOwners,
          tenant: tenants,
        })
        .from(tenantOnboardingLinks)
        .innerJoin(tenantOwners, eq(tenantOwners.id, tenantOnboardingLinks.tenantOwnerId))
        .innerJoin(tenants, eq(tenants.id, tenantOwners.tenantId))
        .where(eq(tenantOnboardingLinks.tokenHash, tokenHash))
        .limit(1);

      return record ?? null;
    },

    async findInternalSubjectByNormalizedLoginIdentifier(normalizedLoginIdentifier: string) {
      const [subject] = await executor
        .select()
        .from(authSubjects)
        .where(
          and(
            eq(authSubjects.subjectType, "internal"),
            eq(authSubjects.normalizedLoginIdentifier, normalizedLoginIdentifier),
          ),
        )
        .limit(1);

      return subject ?? null;
    },

    async insertAuthSubject(values: typeof authSubjects.$inferInsert) {
      await executor.insert(authSubjects).values(values);
    },

    async insertAuthAssuranceChallenge(values: typeof authAssuranceChallenges.$inferInsert) {
      await executor.insert(authAssuranceChallenges).values(values);
    },

    async updateOnboardingLink(
      linkId: string,
      values: Partial<typeof tenantOnboardingLinks.$inferInsert>,
    ) {
      await executor
        .update(tenantOnboardingLinks)
        .set(values)
        .where(eq(tenantOnboardingLinks.id, linkId));
    },

    async updateOwner(
      tenantOwnerId: string,
      values: Partial<typeof tenantOwners.$inferInsert>,
    ) {
      await executor.update(tenantOwners).set(values).where(eq(tenantOwners.id, tenantOwnerId));
    },

    async insertLifecycleEvent(value: typeof tenantLifecycleEvents.$inferInsert) {
      await executor.insert(tenantLifecycleEvents).values(value);
    },

    async insertAuthAccountEvent(value: typeof authAccountEvents.$inferInsert) {
      await executor.insert(authAccountEvents).values(value);
    },
  };
}

export function createOwnerActivationRepository(db: VisionDatabase) {
  const repository = createRepositoryForExecutor(db);

  return {
    ...repository,
    async transaction<TResult>(
      callback: (
        txRepository: ReturnType<typeof createRepositoryForExecutor>,
      ) => Promise<TResult>,
    ): Promise<TResult> {
      return withDatabaseTransaction(db, async (tx) =>
        callback(createRepositoryForExecutor(tx as unknown as DatabaseExecutor)),
      );
    },
  };
}

export type OwnerActivationRepository = ReturnType<typeof createOwnerActivationRepository>;
