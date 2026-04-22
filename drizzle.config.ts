import { defineConfig } from "drizzle-kit";

import {
  deriveAdminTargetDatabaseUrl,
  getDatabaseAdminConfig,
  getDatabaseRuntimeConfig,
} from "./packages/db/src/index";

function resolveDrizzleDatabaseUrl(env: NodeJS.ProcessEnv): string {
  if (env.DATABASE_ADMIN_URL || env.DATABASE_ADMIN_TARGET_DB) {
    const { adminDatabaseUrl, adminTargetDatabaseName } = getDatabaseAdminConfig(env);

    return deriveAdminTargetDatabaseUrl(
      adminDatabaseUrl,
      adminTargetDatabaseName,
    );
  }

  return getDatabaseRuntimeConfig(env).databaseUrl;
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./packages/db/src/schema/index.ts",
  out: "./db/migrations",
  dbCredentials: {
    url: resolveDrizzleDatabaseUrl(process.env),
  },
  migrations: {
    table: "__drizzle_migrations",
    schema: "drizzle",
  },
});
