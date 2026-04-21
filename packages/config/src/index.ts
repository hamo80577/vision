import { z } from "zod";

const localDatabaseUrl =
  "postgresql://vision_local:vision_local_password@localhost:5433/vision_local";
const localDatabaseAdminUrl =
  "postgresql://vision_local:vision_local_password@localhost:5433/postgres";
const localDatabaseUser = "vision_local";
const localDatabasePassword = "vision_local_password";

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

function assertSafeDatabaseUrl(appEnv: AppEnvironment, databaseUrl: string): void {
  if (appEnv !== "staging" && appEnv !== "production") {
    return;
  }

  const parsedUrl = new URL(databaseUrl);
  const username = decodeURIComponent(parsedUrl.username);
  const password = decodeURIComponent(parsedUrl.password);
  const databaseName = getDatabaseName(databaseUrl);
  const usesLocalDefaults =
    databaseUrl === localDatabaseUrl ||
    databaseUrl === localDatabaseAdminUrl ||
    username === localDatabaseUser ||
    password === localDatabasePassword ||
    (parsedUrl.hostname === "localhost" && databaseName === "vision_local");

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

  if (getDatabaseName(adminDatabaseUrl) !== "postgres") {
    throw new ConfigError([
      `${appEnv} DATABASE_ADMIN_URL must point to the postgres maintenance database`,
    ]);
  }

  if (adminTargetDatabaseName !== getDatabaseName(databaseUrl)) {
    throw new ConfigError([`${appEnv} DATABASE_ADMIN_TARGET_DB must match DATABASE_URL`]);
  }
}

export function parseDatabaseRuntimeConfig(env: RuntimeEnv): DatabaseRuntimeConfig {
  const parsed = parseEnv(databaseRuntimeEnvSchema, env);

  assertSafeDatabaseUrl(parsed.APP_ENV, parsed.DATABASE_URL);

  return {
    appEnv: parsed.APP_ENV,
    databaseUrl: parsed.DATABASE_URL,
  };
}

export function parseDatabaseAdminConfig(env: RuntimeEnv): DatabaseAdminConfig {
  const parsed = parseEnv(databaseAdminEnvSchema, env);

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

  assertSafeDatabaseUrl(parsed.APP_ENV, parsed.DATABASE_URL);

  return {
    appEnv: parsed.APP_ENV,
    host: parsed.API_HOST,
    port: parsed.API_PORT,
    databaseUrl: parsed.DATABASE_URL,
    mfaEncryptionKey: parsed.AUTH_MFA_ENCRYPTION_KEY,
    mfaEncryptionKeyVersion: parsed.AUTH_MFA_ENCRYPTION_KEY_VERSION,
    logLevel: parsed.LOG_LEVEL,
  };
}

export function parseWorkerConfig(env: RuntimeEnv): WorkerConfig {
  const parsed = parseEnv(workerEnvSchema, env);

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
