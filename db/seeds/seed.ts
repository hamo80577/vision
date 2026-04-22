import {
  appMetadata,
  closeDatabasePool,
  createDatabaseClient,
  createDatabasePool,
  deriveAdminTargetDatabaseUrl,
  getDatabaseAdminConfig,
  getDatabaseRuntimeConfig,
  withDatabaseTransaction,
} from "../../packages/db/src/index";

function resolveSeedDatabaseUrl(env: NodeJS.ProcessEnv): string {
  if (env.DATABASE_ADMIN_URL || env.DATABASE_ADMIN_TARGET_DB) {
    const adminConfig = getDatabaseAdminConfig(env);

    return deriveAdminTargetDatabaseUrl(
      adminConfig.adminDatabaseUrl,
      adminConfig.adminTargetDatabaseName,
    );
  }

  return getDatabaseRuntimeConfig(env).databaseUrl;
}

const databaseUrl = resolveSeedDatabaseUrl(process.env);
const pool = createDatabasePool(databaseUrl);
const db = createDatabaseClient(pool);

try {
  await withDatabaseTransaction(db, async (tx) => {
    await tx.delete(appMetadata);
    await tx.insert(appMetadata).values([
      {
        key: "schema_baseline",
        value: "phase_5",
      },
      {
        key: "seed_version",
        value: "2026-04-21-phase-5",
      },
    ]);
  });

  console.log("Seeded app_metadata.");
} finally {
  await closeDatabasePool(pool);
}
