import {
  appMetadata,
  closeDatabasePool,
  createDatabaseClient,
  createDatabasePool,
  getDatabaseRuntimeConfig,
  withDatabaseTransaction,
} from "../../packages/db/src/index";

const { databaseUrl } = getDatabaseRuntimeConfig(process.env);
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
