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
  "postgresql://vision_runtime:vision_runtime_password@localhost:5433/vision_local";
const localAdminDatabaseUrl =
  "postgresql://vision_admin:vision_admin_password@localhost:5433/postgres";

const validApiEnv = {
  APP_ENV: "local",
  API_HOST: "127.0.0.1",
  API_PORT: "4000",
  DATABASE_URL: localDatabaseUrl,
  AUTH_MFA_ENCRYPTION_KEY: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
  AUTH_MFA_ENCRYPTION_KEY_VERSION: "v1",
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
      mfaEncryptionKey: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
      mfaEncryptionKeyVersion: "v1",
      allowedOrigins: [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:3002",
        "http://127.0.0.1:3002",
      ],
      logLevel: "info",
    });
  });

  it.each(["debug", "warn"] as const)(
    "accepts %s as an explicit API log level",
    (logLevel) => {
      expect(
        parseApiConfig({
          ...validApiEnv,
          LOG_LEVEL: logLevel,
        }),
      ).toEqual({
        appEnv: "local",
        host: "127.0.0.1",
        port: 4000,
        databaseUrl: localDatabaseUrl,
        mfaEncryptionKey: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
        mfaEncryptionKeyVersion: "v1",
        allowedOrigins: [
          "http://localhost:3000",
          "http://127.0.0.1:3000",
          "http://localhost:3001",
          "http://127.0.0.1:3001",
          "http://localhost:3002",
          "http://127.0.0.1:3002",
        ],
        logLevel,
      });
    },
  );

  it.each(["verbose", "trace"] as const)(
    "rejects %s as an API log level",
    (logLevel) => {
      expect(() =>
        parseApiConfig({
          ...validApiEnv,
          LOG_LEVEL: logLevel,
        }),
      ).toThrow(ConfigError);
    },
  );

  it("fails when DATABASE_URL is missing for API config", () => {
    const { DATABASE_URL: _databaseUrl, ...missingDatabaseUrlEnv } = validApiEnv;

    expect(() => parseApiConfig(missingDatabaseUrlEnv)).toThrow(ConfigError);
  });

  it("fails when AUTH_MFA_ENCRYPTION_KEY is missing for API config", () => {
    const {
      AUTH_MFA_ENCRYPTION_KEY: _missingEncryptionKey,
      ...missingEncryptionKeyEnv
    } = validApiEnv;

    expect(() => parseApiConfig(missingEncryptionKeyEnv)).toThrow(ConfigError);
  });

  it("fails when AUTH_MFA_ENCRYPTION_KEY is not a base64-encoded 32-byte key", () => {
    expect(() =>
      parseApiConfig({
        ...validApiEnv,
        AUTH_MFA_ENCRYPTION_KEY: "not-a-valid-key",
      }),
    ).toThrow(ConfigError);
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

  it("parses explicit API CORS origins", () => {
    expect(
      parseApiConfig({
        ...validApiEnv,
        CORS_ALLOWED_ORIGINS: "https://platform.vision.test, https://erp.vision.test",
      }),
    ).toMatchObject({
      allowedOrigins: ["https://platform.vision.test", "https://erp.vision.test"],
    });
  });

  it("rejects the local database password in production worker config", () => {
    expect(() =>
      parseWorkerConfig({
        APP_ENV: "production",
        DATABASE_URL:
          "postgresql://vision_service:vision_runtime_password@db.internal:5432/vision",
      }),
    ).toThrow(ConfigError);
  });

  it("rejects the local database username in staging worker config", () => {
    expect(() =>
      parseWorkerConfig({
        APP_ENV: "staging",
        DATABASE_URL:
          "postgresql://vision_runtime:staging_password@db.internal:5432/vision",
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

  it("rejects non-PostgreSQL database URLs", () => {
    expect(() =>
      parseDatabaseRuntimeConfig({
        APP_ENV: "local",
        DATABASE_URL: "https://db.example.com/vision_local",
      }),
    ).toThrow(ConfigError);
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

  it("fails when production DATABASE_ADMIN_URL targets the application database", () => {
    const productionDatabaseUrl =
      "postgresql://vision_service:prod_password@db.internal:5432/vision_prod";

    expect(() =>
      parseDatabaseAdminConfig({
        APP_ENV: "production",
        DATABASE_URL: productionDatabaseUrl,
        DATABASE_ADMIN_URL: productionDatabaseUrl,
        DATABASE_ADMIN_TARGET_DB: "vision_prod",
      }),
    ).toThrow(ConfigError);
  });

  it("fails when DATABASE_ADMIN_URL points at a different database host", () => {
    expect(() =>
      parseDatabaseAdminConfig({
        APP_ENV: "production",
        DATABASE_URL: "postgresql://vision_service:prod_password@db.internal:5432/vision_prod",
        DATABASE_ADMIN_URL:
          "postgresql://vision_migrator:admin_password@other-host.internal:5432/postgres",
        DATABASE_ADMIN_TARGET_DB: "vision_prod",
      }),
    ).toThrow(ConfigError);
  });

  it("fails when DATABASE_ADMIN_URL does not target the postgres maintenance database", () => {
    expect(() =>
      parseDatabaseAdminConfig({
        APP_ENV: "local",
        DATABASE_URL: localDatabaseUrl,
        DATABASE_ADMIN_URL:
          "postgresql://vision_admin:vision_admin_password@localhost:5433/template1",
        DATABASE_ADMIN_TARGET_DB: "vision_local",
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

  it("fails when DATABASE_ADMIN_URL reuses the runtime role username", () => {
    expect(() =>
      parseDatabaseAdminConfig({
        APP_ENV: "test",
        DATABASE_URL: "postgresql://vision_runtime:runtime_password@localhost:5432/vision_local",
        DATABASE_ADMIN_URL:
          "postgresql://vision_runtime:admin_password@localhost:5432/postgres",
        DATABASE_ADMIN_TARGET_DB: "vision_local",
      }),
    ).toThrow(ConfigError);
  });

  it("fails when DATABASE_URL omits role credentials", () => {
    expect(() =>
      parseDatabaseRuntimeConfig({
        APP_ENV: "test",
        DATABASE_URL: "postgresql://localhost:5432/vision_local",
      }),
    ).toThrow(ConfigError);
  });

  it("fails when DATABASE_ADMIN_URL omits role credentials", () => {
    expect(() =>
      parseDatabaseAdminConfig({
        APP_ENV: "test",
        DATABASE_URL: "postgresql://vision_runtime:runtime_password@localhost:5432/vision_local",
        DATABASE_ADMIN_URL: "postgresql://localhost:5432/postgres",
        DATABASE_ADMIN_TARGET_DB: "vision_local",
      }),
    ).toThrow(ConfigError);
  });

  it("rejects loopback hosts with the local database name in production runtime config", () => {
    expect(() =>
      parseDatabaseRuntimeConfig({
        APP_ENV: "production",
        DATABASE_URL: "postgresql://vision_service:prod_password@127.0.0.1:5432/vision_local",
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
      logLevel: "info",
    });
  });

  it.each(["debug", "warn"] as const)(
    "accepts %s as an explicit worker log level",
    (logLevel) => {
      expect(
        parseWorkerConfig({
          APP_ENV: "test",
          DATABASE_URL: "postgresql://vision_test:test_password@localhost:5432/vision_test",
          LOG_LEVEL: logLevel,
        }),
      ).toEqual({
        appEnv: "test",
        databaseUrl: "postgresql://vision_test:test_password@localhost:5432/vision_test",
        logLevel,
      });
    },
  );

  it.each(["verbose", "trace"] as const)(
    "rejects %s as a worker log level",
    (logLevel) => {
      expect(() =>
        parseWorkerConfig({
          APP_ENV: "test",
          DATABASE_URL: "postgresql://vision_test:test_password@localhost:5432/vision_test",
          LOG_LEVEL: logLevel,
        }),
      ).toThrow(ConfigError);
    },
  );

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
