import { defineConfig } from "drizzle-kit";

import { getDatabaseAdminConfig } from "./packages/db/src/config";

const { adminDatabaseUrl } = getDatabaseAdminConfig(process.env);

export default defineConfig({
  dialect: "postgresql",
  schema: "./packages/db/src/schema/index.ts",
  out: "./db/migrations",
  dbCredentials: {
    url: adminDatabaseUrl
  },
  migrations: {
    table: "__drizzle_migrations",
    schema: "drizzle"
  }
});
