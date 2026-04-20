import {
  parseDatabaseAdminConfig,
  parseDatabaseRuntimeConfig,
  type DatabaseAdminConfig,
  type DatabaseRuntimeConfig,
  type RuntimeEnv,
} from "@vision/config";

export type { DatabaseAdminConfig, DatabaseRuntimeConfig };

export function getDatabaseRuntimeConfig(env: RuntimeEnv = process.env): DatabaseRuntimeConfig {
  return parseDatabaseRuntimeConfig(env);
}

export function getDatabaseAdminConfig(env: RuntimeEnv = process.env): DatabaseAdminConfig {
  return parseDatabaseAdminConfig(env);
}
