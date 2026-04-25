import { z } from "zod";

const localDatabaseUrl =
  "postgresql://vision_runtime:vision_runtime_password@localhost:5433/vision_local";
const localDatabaseAdminUrl =
  "postgresql://vision_admin:vision_admin_password@localhost:5433/postgres";
const localDatabaseUsers = ["vision_runtime", "vision_admin"];
const localDatabasePasswords = [
  "vision_runtime_password",
  "vision_admin_password",
];

const appEnvironmentSchema = z.enum(["local", "test", "staging", "production"]);
const logLevelSchema = z.enum(["debug", "info", "warn", "error"]);

const portSchema = z.coerce.number().int().min(1).max(65535);
const urlSchema = z.string().url();
const mfaEncryptionKeySchema = z.string().refine(
  (value) => {
    try {
      return Buffer.from(value, "base64").length === 32;
    } catch {
      return false;
    }
  },
  {
    message: "must be a base64-encoded 32-byte key",
  },
);
const databaseUrlSchema = urlSchema.refine(
  (value) => {
    const protocol = new URL(value).protocol;

    return protocol === "postgres:" || protocol === "postgresql:";
  },
  {
    message: "must use postgres or postgresql protocol",
  },
);

function getDatabaseUsername(databaseUrl: string): string {
  return decodeURIComponent(new URL(databaseUrl).username);
}

function getDatabasePassword(databaseUrl: string): string {
  return decodeURIComponent(new URL(databaseUrl).password);
}

const databaseRuntimeEnvSchema = z.object({
  APP_ENV: appEnvironmentSchema,
  DATABASE_URL: databaseUrlSchema,
});

const databaseAdminEnvSchema = databaseRuntimeEnvSchema.extend({
  DATABASE_ADMIN_URL: databaseUrlSchema,
  DATABASE_ADMIN_TARGET_DB: z.string().min(1),
});

const apiEnvSchema = z.object({
  APP_ENV: appEnvironmentSchema,
  API_HOST: z.string().min(1),
  API_PORT: portSchema,
  DATABASE_URL: databaseUrlSchema,
  AUTH_MFA_ENCRYPTION_KEY: mfaEncryptionKeySchema,
  AUTH_MFA_ENCRYPTION_KEY_VERSION: z.string().min(1),
  CORS_ALLOWED_ORIGINS: z.string().optional(),
  LOG_LEVEL: logLevelSchema.default("info"),
});

const workerEnvSchema = z.object({
  APP_ENV: appEnvironmentSchema,
  DATABASE_URL: databaseUrlSchema,
  LOG_LEVEL: logLevelSchema.default("info"),
});

const frontendEnvSchema = z.object({
  APP_ENV: appEnvironmentSchema,
  NEXT_PUBLIC_API_BASE_URL: urlSchema,
});

export type AppEnvironment = z.infer<typeof appEnvironmentSchema>;
export type LogLevel = z.infer<typeof logLevelSchema>;

export type RuntimeEnv = Record<string, string | undefined>;

export type ApiConfig = {
  appEnv: AppEnvironment;
  host: string;
  port: number;
  databaseUrl: string;
  mfaEncryptionKey: string;
  mfaEncryptionKeyVersion: string;
  allowedOrigins: string[];
  logLevel: LogLevel;
};

export type WorkerConfig = {
  appEnv: AppEnvironment;
  databaseUrl: string;
  logLevel: LogLevel;
};

export type DatabaseRuntimeConfig = {
  appEnv: AppEnvironment;
  databaseUrl: string;
};

export type DatabaseAdminConfig = DatabaseRuntimeConfig & {
  adminDatabaseUrl: string;
  adminTargetDatabaseName: string;
};

export type FrontendConfig = {
  appEnv: AppEnvironment;
  publicApiBaseUrl: string;
};

export type WebConfig = FrontendConfig;
export type ErpConfig = FrontendConfig;
export type PlatformConfig = FrontendConfig;

export class ConfigError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid runtime configuration: ${issues.join("; ")}`);
    this.name = "ConfigError";
    this.issues = issues;
  }
}

function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join(".");

    return `${path || "env"}: ${issue.message}`;
  });
}

function parseEnv<T>(schema: z.ZodType<T>, env: RuntimeEnv): T {
  const result = schema.safeParse(env);

  if (!result.success) {
    throw new ConfigError(formatIssues(result.error));
  }

  return result.data;
}

function getDatabaseName(databaseUrl: string): string {
  const parsedUrl = new URL(databaseUrl);
  const databaseName = parsedUrl.pathname.replace(/^\//, "");

  if (!databaseName) {
    throw new ConfigError(["database URL must include a database name"]);
  }

  return databaseName;
}

function isLoopbackHostname(hostname: string): boolean {
  const normalizedHostname = hostname.toLowerCase();

  return (
    normalizedHostname === "localhost" ||
    normalizedHostname === "127.0.0.1" ||
    normalizedHostname.startsWith("127.") ||
    normalizedHostname === "::1" ||
    normalizedHostname === "[::1]"
  );
}

function getDatabasePort(databaseUrl: string): string {
  const parsedUrl = new URL(databaseUrl);

  return parsedUrl.port || "5432";
}

function assertDatabaseUrlHasCredentials(envName: string, databaseUrl: string): void {
  const username = getDatabaseUsername(databaseUrl);
  const password = getDatabasePassword(databaseUrl);

  if (!username || !password) {
    throw new ConfigError([`${envName} must include a database role username and password`]);
  }
}

function assertSafeDatabaseUrl(appEnv: AppEnvironment, databaseUrl: string): void {
  if (appEnv !== "staging" && appEnv !== "production") {
    return;
  }

  const parsedUrl = new URL(databaseUrl);
  const username = getDatabaseUsername(databaseUrl);
  const password = getDatabasePassword(databaseUrl);
  const databaseName = getDatabaseName(databaseUrl);
  const usesLocalDefaults =
    databaseUrl === localDatabaseUrl ||
    databaseUrl === localDatabaseAdminUrl ||
    localDatabaseUsers.includes(username) ||
    localDatabasePasswords.includes(password) ||
    (isLoopbackHostname(parsedUrl.hostname) && databaseName === "vision_local");

  if (usesLocalDefaults) {
    throw new ConfigError([`${appEnv} DATABASE_URL must not use local database defaults`]);
  }
}

function assertValidAdminDatabaseUrl(
  appEnv: AppEnvironment,
  databaseUrl: string,
  adminDatabaseUrl: string,
  adminTargetDatabaseName: string,
): void {
  assertSafeDatabaseUrl(appEnv, adminDatabaseUrl);
  assertDatabaseUrlHasCredentials("DATABASE_ADMIN_URL", adminDatabaseUrl);

  const runtimeDatabaseUrl = new URL(databaseUrl);
  const runtimeDatabasePort = getDatabasePort(databaseUrl);
  const adminMaintenanceUrl = new URL(adminDatabaseUrl);
  const adminMaintenancePort = getDatabasePort(adminDatabaseUrl);
  const runtimeDatabaseUsername = getDatabaseUsername(databaseUrl);
  const adminDatabaseUsername = getDatabaseUsername(adminDatabaseUrl);

  if (
    runtimeDatabaseUrl.hostname !== adminMaintenanceUrl.hostname ||
    runtimeDatabasePort !== adminMaintenancePort
  ) {
    throw new ConfigError([
      `${appEnv} DATABASE_ADMIN_URL must target the same database host and port as DATABASE_URL`,
    ]);
  }

  if (getDatabaseName(adminDatabaseUrl) !== "postgres") {
    throw new ConfigError([
      `${appEnv} DATABASE_ADMIN_URL must point to the postgres maintenance database`,
    ]);
  }

  if (adminTargetDatabaseName !== getDatabaseName(databaseUrl)) {
    throw new ConfigError([`${appEnv} DATABASE_ADMIN_TARGET_DB must match DATABASE_URL`]);
  }

  if (runtimeDatabaseUsername === adminDatabaseUsername) {
    throw new ConfigError([
      `${appEnv} DATABASE_ADMIN_URL must use a different database role than DATABASE_URL`,
    ]);
  }
}

export function parseDatabaseRuntimeConfig(env: RuntimeEnv): DatabaseRuntimeConfig {
  const parsed = parseEnv(databaseRuntimeEnvSchema, env);

  assertDatabaseUrlHasCredentials("DATABASE_URL", parsed.DATABASE_URL);
  assertSafeDatabaseUrl(parsed.APP_ENV, parsed.DATABASE_URL);

  return {
    appEnv: parsed.APP_ENV,
    databaseUrl: parsed.DATABASE_URL,
  };
}

export function parseDatabaseAdminConfig(env: RuntimeEnv): DatabaseAdminConfig {
  const parsed = parseEnv(databaseAdminEnvSchema, env);

  assertDatabaseUrlHasCredentials("DATABASE_URL", parsed.DATABASE_URL);
  assertSafeDatabaseUrl(parsed.APP_ENV, parsed.DATABASE_URL);
  assertValidAdminDatabaseUrl(
    parsed.APP_ENV,
    parsed.DATABASE_URL,
    parsed.DATABASE_ADMIN_URL,
    parsed.DATABASE_ADMIN_TARGET_DB,
  );

  return {
    appEnv: parsed.APP_ENV,
    databaseUrl: parsed.DATABASE_URL,
    adminDatabaseUrl: parsed.DATABASE_ADMIN_URL,
    adminTargetDatabaseName: parsed.DATABASE_ADMIN_TARGET_DB,
  };
}

export function parseApiConfig(env: RuntimeEnv): ApiConfig {
  const parsed = parseEnv(apiEnvSchema, env);

  assertDatabaseUrlHasCredentials("DATABASE_URL", parsed.DATABASE_URL);
  assertSafeDatabaseUrl(parsed.APP_ENV, parsed.DATABASE_URL);

  const allowedOrigins =
    parsed.CORS_ALLOWED_ORIGINS
      ?.split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0) ??
    (parsed.APP_ENV === "local" || parsed.APP_ENV === "test"
      ? [
          "http://localhost:3000",
          "http://127.0.0.1:3000",
          "http://localhost:3001",
          "http://127.0.0.1:3001",
          "http://localhost:3002",
          "http://127.0.0.1:3002",
        ]
      : []);

  return {
    appEnv: parsed.APP_ENV,
    host: parsed.API_HOST,
    port: parsed.API_PORT,
    databaseUrl: parsed.DATABASE_URL,
    mfaEncryptionKey: parsed.AUTH_MFA_ENCRYPTION_KEY,
    mfaEncryptionKeyVersion: parsed.AUTH_MFA_ENCRYPTION_KEY_VERSION,
    allowedOrigins,
    logLevel: parsed.LOG_LEVEL,
  };
}

export function parseWorkerConfig(env: RuntimeEnv): WorkerConfig {
  const parsed = parseEnv(workerEnvSchema, env);

  assertDatabaseUrlHasCredentials("DATABASE_URL", parsed.DATABASE_URL);
  assertSafeDatabaseUrl(parsed.APP_ENV, parsed.DATABASE_URL);

  return {
    appEnv: parsed.APP_ENV,
    databaseUrl: parsed.DATABASE_URL,
    logLevel: parsed.LOG_LEVEL,
  };
}

function parseFrontendConfig(env: RuntimeEnv): FrontendConfig {
  const parsed = parseEnv(frontendEnvSchema, env);

  return {
    appEnv: parsed.APP_ENV,
    publicApiBaseUrl: parsed.NEXT_PUBLIC_API_BASE_URL,
  };
}

export function parseWebConfig(env: RuntimeEnv): WebConfig {
  return parseFrontendConfig(env);
}

export function parseErpConfig(env: RuntimeEnv): ErpConfig {
  return parseFrontendConfig(env);
}

export function parsePlatformConfig(env: RuntimeEnv): PlatformConfig {
  return parseFrontendConfig(env);
}
