import { defineConfig } from "drizzle-kit";

import { getDatabaseRuntimeConfig } from "./packages/db/src/config";

const { databaseUrl } = getDatabaseRuntimeConfig(process.env);

export default defineConfig({
  dialect: "postgresql",
  schema: "./packages/db/src/schema/index.ts",
  out: "./db/migrations",
  dbCredentials: {
    url: databaseUrl,
  },
  migrations: {
    table: "__drizzle_migrations",
    schema: "drizzle",
  },
});
