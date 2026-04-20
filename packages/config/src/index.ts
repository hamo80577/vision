import { z } from "zod";

const localDatabaseUrl =
  "postgresql://vision_local:vision_local_password@localhost:5432/vision_local";
const localDatabaseUser = "vision_local";
const localDatabasePassword = "vision_local_password";

const appEnvironmentSchema = z.enum([
  "local",
  "test",
  "staging",
  "production"
]);

const portSchema = z.coerce.number().int().min(1).max(65535);
const urlSchema = z.string().url();

const apiEnvSchema = z.object({
  APP_ENV: appEnvironmentSchema,
  API_HOST: z.string().min(1),
  API_PORT: portSchema,
  DATABASE_URL: urlSchema
});

const workerEnvSchema = z.object({
  APP_ENV: appEnvironmentSchema,
  DATABASE_URL: urlSchema
});

const frontendEnvSchema = z.object({
  APP_ENV: appEnvironmentSchema,
  NEXT_PUBLIC_API_BASE_URL: urlSchema
});

export type AppEnvironment = z.infer<typeof appEnvironmentSchema>;

export type RuntimeEnv = Record<string, string | undefined>;

export type ApiConfig = {
  appEnv: AppEnvironment;
  host: string;
  port: number;
  databaseUrl: string;
};

export type WorkerConfig = {
  appEnv: AppEnvironment;
  databaseUrl: string;
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

function assertSafeDatabaseUrl(
  appEnv: AppEnvironment,
  databaseUrl: string
): void {
  if (appEnv !== "staging" && appEnv !== "production") {
    return;
  }

  const parsedUrl = new URL(databaseUrl);
  const username = decodeURIComponent(parsedUrl.username);
  const password = decodeURIComponent(parsedUrl.password);
  const databaseName = parsedUrl.pathname.replace(/^\//, "");
  const usesLocalDefaults =
    databaseUrl === localDatabaseUrl ||
    username === localDatabaseUser ||
    password === localDatabasePassword ||
    (parsedUrl.hostname === "localhost" && databaseName === "vision_local");

  if (usesLocalDefaults) {
    throw new ConfigError([
      `${appEnv} DATABASE_URL must not use local database defaults`
    ]);
  }
}

export function parseApiConfig(env: RuntimeEnv): ApiConfig {
  const parsed = parseEnv(apiEnvSchema, env);

  assertSafeDatabaseUrl(parsed.APP_ENV, parsed.DATABASE_URL);

  return {
    appEnv: parsed.APP_ENV,
    host: parsed.API_HOST,
    port: parsed.API_PORT,
    databaseUrl: parsed.DATABASE_URL
  };
}

export function parseWorkerConfig(env: RuntimeEnv): WorkerConfig {
  const parsed = parseEnv(workerEnvSchema, env);

  assertSafeDatabaseUrl(parsed.APP_ENV, parsed.DATABASE_URL);

  return {
    appEnv: parsed.APP_ENV,
    databaseUrl: parsed.DATABASE_URL
  };
}

function parseFrontendConfig(env: RuntimeEnv): FrontendConfig {
  const parsed = parseEnv(frontendEnvSchema, env);

  return {
    appEnv: parsed.APP_ENV,
    publicApiBaseUrl: parsed.NEXT_PUBLIC_API_BASE_URL
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
