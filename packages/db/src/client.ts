import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

import type { DatabaseRuntimeConfig } from "./config";
import * as schema from "./schema";

export type VisionDatabase = NodePgDatabase<typeof schema>;
export type DatabasePool = Pool;

export function createDatabasePool(
  connectionString: string,
  overrides: Partial<PoolConfig> = {}
): DatabasePool {
  return new Pool({
    connectionString,
    ...overrides
  });
}

export function createDatabaseClient(pool: DatabasePool): VisionDatabase {
  return drizzle(pool, { schema });
}

export function createRuntimeDatabase(
  config: DatabaseRuntimeConfig,
  overrides: Partial<PoolConfig> = {}
) {
  const pool = createDatabasePool(config.databaseUrl, overrides);

  return {
    pool,
    db: createDatabaseClient(pool)
  } as const;
}

export async function closeDatabasePool(pool: DatabasePool): Promise<void> {
  await pool.end();
}
