import { describe, expect, it } from "vitest";

import {
  ConfigError,
  parseApiConfig,
  parseDatabaseAdminConfig,
  parseDatabaseRuntimeConfig,
  parseErpConfig,
  parsePlatformConfig,
  parseWebConfig,
  parseWorkerConfig,
} from "./index";

const localDatabaseUrl =
  "postgresql://vision_local:vision_local_password@localhost:5432/vision_local";
const localAdminDatabaseUrl =
  "postgresql://vision_local:vision_local_password@localhost:5432/postgres";

const validApiEnv = {
  APP_ENV: "local",
  API_HOST: "127.0.0.1",
  API_PORT: "4000",
  DATABASE_URL: localDatabaseUrl,
};

const validFrontendEnv = {
  APP_ENV: "local",
  NEXT_PUBLIC_API_BASE_URL: "http://localhost:4000",
};

describe("@vision/config", () => {
  it("parses valid local API config", () => {
    expect(parseApiConfig(validApiEnv)).toEqual({
      appEnv: "local",
      host: "127.0.0.1",
      port: 4000,
      databaseUrl: localDatabaseUrl,
    });
  });

  it("fails when DATABASE_URL is missing for API config", () => {
    const { DATABASE_URL: _databaseUrl, ...missingDatabaseUrlEnv } = validApiEnv;

    expect(() => parseApiConfig(missingDatabaseUrlEnv)).toThrow(ConfigError);
  });

  it("fails when API_PORT is invalid", () => {
    expect(() =>
      parseApiConfig({
        ...validApiEnv,
        API_PORT: "99999",
      }),
    ).toThrow(ConfigError);
  });

  it("rejects the local database default in production API config", () => {
    expect(() =>
      parseApiConfig({
        ...validApiEnv,
        APP_ENV: "production",
        API_HOST: "0.0.0.0",
      }),
    ).toThrow(ConfigError);
  });

  it("rejects the local database password in production worker config", () => {
    expect(() =>
      parseWorkerConfig({
        APP_ENV: "production",
        DATABASE_URL: "postgresql://vision_service:vision_local_password@db.internal:5432/vision",
      }),
    ).toThrow(ConfigError);
  });

  it("rejects the local database username in staging worker config", () => {
    expect(() =>
      parseWorkerConfig({
        APP_ENV: "staging",
        DATABASE_URL: "postgresql://vision_local:staging_password@db.internal:5432/vision",
      }),
    ).toThrow(ConfigError);
  });

  it("parses database runtime config", () => {
    expect(
      parseDatabaseRuntimeConfig({
        APP_ENV: "test",
        DATABASE_URL: "postgresql://vision_test:test_password@localhost:5432/vision_test",
      }),
    ).toEqual({
      appEnv: "test",
      databaseUrl: "postgresql://vision_test:test_password@localhost:5432/vision_test",
    });
  });

  it("parses database admin config", () => {
    expect(
      parseDatabaseAdminConfig({
        APP_ENV: "local",
        DATABASE_URL: localDatabaseUrl,
        DATABASE_ADMIN_URL: localAdminDatabaseUrl,
        DATABASE_ADMIN_TARGET_DB: "vision_local",
      }),
    ).toEqual({
      appEnv: "local",
      databaseUrl: localDatabaseUrl,
      adminDatabaseUrl: localAdminDatabaseUrl,
      adminTargetDatabaseName: "vision_local",
    });
  });

  it("fails when DATABASE_ADMIN_URL is missing", () => {
    expect(() =>
      parseDatabaseAdminConfig({
        APP_ENV: "local",
        DATABASE_URL: localDatabaseUrl,
      }),
    ).toThrow(ConfigError);
  });

  it("fails when DATABASE_ADMIN_TARGET_DB is missing", () => {
    expect(() =>
      parseDatabaseAdminConfig({
        APP_ENV: "local",
        DATABASE_URL: localDatabaseUrl,
        DATABASE_ADMIN_URL: localAdminDatabaseUrl,
      }),
    ).toThrow(ConfigError);
  });

  it("fails when DATABASE_ADMIN_URL targets the same local database", () => {
    expect(() =>
      parseDatabaseAdminConfig({
        APP_ENV: "local",
        DATABASE_URL: localDatabaseUrl,
        DATABASE_ADMIN_URL: localDatabaseUrl,
        DATABASE_ADMIN_TARGET_DB: "vision_local",
      }),
    ).toThrow(ConfigError);
  });

  it("parses worker config without opening a database connection", () => {
    expect(
      parseWorkerConfig({
        APP_ENV: "test",
        DATABASE_URL: "postgresql://vision_test:test_password@localhost:5432/vision_test",
      }),
    ).toEqual({
      appEnv: "test",
      databaseUrl: "postgresql://vision_test:test_password@localhost:5432/vision_test",
    });
  });

  it("parses frontend config from public variables only", () => {
    const config = parseWebConfig({
      ...validFrontendEnv,
      DATABASE_URL: localDatabaseUrl,
    });

    expect(config).toEqual({
      appEnv: "local",
      publicApiBaseUrl: "http://localhost:4000",
    });
    expect("databaseUrl" in config).toBe(false);
  });

  it("uses the same public frontend contract for ERP and platform apps", () => {
    expect(parseErpConfig(validFrontendEnv)).toEqual({
      appEnv: "local",
      publicApiBaseUrl: "http://localhost:4000",
    });
    expect(parsePlatformConfig(validFrontendEnv)).toEqual({
      appEnv: "local",
      publicApiBaseUrl: "http://localhost:4000",
    });
  });
});
