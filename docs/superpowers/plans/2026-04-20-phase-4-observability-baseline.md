# Phase 4 Observability Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Vision Phase 4 with a real shared observability package, structured API and worker logs, validated request and correlation IDs, lightweight Problem Details-style API errors, and no-op tracing hooks without introducing telemetry platform deployment work.

**Architecture:** `@vision/observability` becomes the shared transport-agnostic baseline for IDs, context, logger creation, problem payloads, error helpers, and tracing hooks. `apps/api` stays the Fastify-specific adapter for request context and HTTP error mapping, while `apps/worker` stays the worker-specific adapter for startup and operation logging; both reuse the same shared context and log contracts.

**Tech Stack:** TypeScript, Vitest, Fastify, workspace packages, structured JSON logs via an internal logger helper, no-op tracing hooks, pnpm, Turborepo.

---

## File Map

- Modify `.env.example`: add baseline `LOG_LEVEL`.
- Modify `docs/project/local-development.md`: document local logging config and structured-log expectations.
- Modify `packages/config/src/index.ts`: add `LOG_LEVEL` parsing for API and worker runtime config.
- Modify `packages/config/src/index.test.ts`: add tests for default and explicit log levels.
- Modify `packages/observability/package.json`: require real tests instead of `--passWithNoTests`.
- Replace `packages/observability/src/index.ts`: export the real shared surface.
- Create `packages/observability/src/ids.ts`: validate, sanitize, and generate request/correlation IDs.
- Create `packages/observability/src/ids.test.ts`: prove safe ID behavior.
- Create `packages/observability/src/context.ts`: create and extend baseline observability context.
- Create `packages/observability/src/context.test.ts`: prove context generation and inheritance behavior.
- Create `packages/observability/src/problem-details.ts`: define Problem Details types and instance sanitization.
- Create `packages/observability/src/problem-details.test.ts`: prove path-only instance behavior and optional extensions.
- Create `packages/observability/src/errors.ts`: define baseline problem codes, error helpers, and log-safe error serialization.
- Create `packages/observability/src/errors.test.ts`: prove stable status-to-problem mapping and error helper behavior.
- Create `packages/observability/src/logger.ts`: implement the shared structured JSON logger with child context support.
- Create `packages/observability/src/logger.test.ts`: prove structured output, level filtering, and safe error serialization.
- Create `packages/observability/src/tracing.ts`: add a tracing hook interface and no-op implementation.
- Create `packages/observability/src/tracing.test.ts`: prove the no-op contract is stable.
- Modify `apps/api/package.json`: add `@vision/observability`.
- Modify `pnpm-lock.yaml`: refresh workspace dependency metadata for API and worker package changes.
- Modify `apps/api/src/runtime.ts`: return full API runtime config including log level and service name.
- Modify `apps/api/src/runtime.test.ts`: cover log level propagation.
- Create `apps/api/src/fastify-types.ts`: type the request-level observability fields through module augmentation.
- Create `apps/api/src/request-context.ts`: validate incoming headers and build request context.
- Create `apps/api/src/request-context.test.ts`: prove ID sanitization and context derivation.
- Create `apps/api/src/http-errors.ts`: map Fastify and application errors to Problem Details.
- Modify `apps/api/src/server.ts`: install request hooks, response headers, structured logging, and safe error handling.
- Modify `apps/api/src/server.test.ts`: cover request headers, path sanitization, validation failures, and fallback 500 behavior.
- Modify `apps/api/src/index.ts`: use the shared logger for startup and startup failure logs.
- Modify `apps/worker/package.json`: add `@vision/observability`.
- Create `apps/worker/src/runtime.ts`: return worker runtime config including log level and service name.
- Create `apps/worker/src/runtime.test.ts`: cover worker runtime config mapping.
- Create `apps/worker/src/context.ts`: create baseline operation context for non-HTTP worker flows.
- Create `apps/worker/src/context.test.ts`: prove worker context generation.
- Create `apps/worker/src/logging.ts`: emit structured startup and idle logs.
- Create `apps/worker/src/logging.test.ts`: prove structured worker log output.
- Modify `apps/worker/src/index.ts`: build logger, create context, and log startup and idle events.
- Create `docs/architecture/observability-baseline.md`: document package boundaries, context fields, and tracing non-goals.
- Create `docs/security/logging-and-error-safety.md`: document safe logging rules and Problem Details exposure limits.

## Boundaries

- Do not add exporter endpoints, collector integration, provider deployment setup, dashboard definitions, or alert routing.
- Do not add vendor SDK rollout logic.
- Do not add a large custom error taxonomy.
- Do not expose full URLs, query strings, stack traces, secrets, or unnecessary PII in client payloads or default logs.
- Keep `@vision/observability` transport-agnostic. Fastify-specific mapping stays in `apps/api`.
- Keep `traceId` optional. `requestId` and `correlationId` are required everywhere.
- Keep auth, tenant, branch, and subject fields as reserved optional context slots only. Do not populate them with real business data in this phase.

## Task 1: Extend Runtime Config For Log Level Baseline

**Files:**
- Modify: `.env.example`
- Modify: `docs/project/local-development.md`
- Modify: `packages/config/src/index.ts`
- Modify: `packages/config/src/index.test.ts`

- [ ] **Step 1: Add failing config tests for `LOG_LEVEL`**

Replace `packages/config/src/index.test.ts` with this exact content:

```ts
import { describe, expect, it } from "vitest";

import {
  ConfigError,
  parseApiConfig,
  parseDatabaseAdminConfig,
  parseDatabaseRuntimeConfig,
  parseErpConfig,
  parsePlatformConfig,
  parseWebConfig,
  parseWorkerConfig
} from "./index";

const localDatabaseUrl =
  "postgresql://vision_local:vision_local_password@localhost:5432/vision_local";
const localAdminDatabaseUrl =
  "postgresql://vision_local:vision_local_password@localhost:5432/postgres";

const validApiEnv = {
  APP_ENV: "local",
  API_HOST: "127.0.0.1",
  API_PORT: "4000",
  DATABASE_URL: localDatabaseUrl
};

const validFrontendEnv = {
  APP_ENV: "local",
  NEXT_PUBLIC_API_BASE_URL: "http://localhost:4000"
};

describe("@vision/config", () => {
  it("parses valid local API config", () => {
    expect(parseApiConfig(validApiEnv)).toEqual({
      appEnv: "local",
      host: "127.0.0.1",
      port: 4000,
      databaseUrl: localDatabaseUrl,
      logLevel: "info"
    });
  });

  it("fails when DATABASE_URL is missing for API config", () => {
    const { DATABASE_URL: _databaseUrl, ...missingDatabaseUrlEnv } =
      validApiEnv;

    expect(() => parseApiConfig(missingDatabaseUrlEnv)).toThrow(ConfigError);
  });

  it("fails when API_PORT is invalid", () => {
    expect(() =>
      parseApiConfig({
        ...validApiEnv,
        API_PORT: "99999"
      })
    ).toThrow(ConfigError);
  });

  it("rejects the local database default in production API config", () => {
    expect(() =>
      parseApiConfig({
        ...validApiEnv,
        APP_ENV: "production",
        API_HOST: "0.0.0.0"
      })
    ).toThrow(ConfigError);
  });

  it("defaults API log level to info", () => {
    expect(parseApiConfig(validApiEnv).logLevel).toBe("info");
  });

  it("parses an explicit API log level", () => {
    expect(
      parseApiConfig({
        ...validApiEnv,
        LOG_LEVEL: "debug"
      })
    ).toEqual({
      appEnv: "local",
      host: "127.0.0.1",
      port: 4000,
      databaseUrl: localDatabaseUrl,
      logLevel: "debug"
    });
  });

  it("rejects an invalid API log level", () => {
    expect(() =>
      parseApiConfig({
        ...validApiEnv,
        LOG_LEVEL: "verbose"
      })
    ).toThrow(ConfigError);
  });

  it("rejects the local database password in production worker config", () => {
    expect(() =>
      parseWorkerConfig({
        APP_ENV: "production",
        DATABASE_URL:
          "postgresql://vision_service:vision_local_password@db.internal:5432/vision"
      })
    ).toThrow(ConfigError);
  });

  it("rejects the local database username in staging worker config", () => {
    expect(() =>
      parseWorkerConfig({
        APP_ENV: "staging",
        DATABASE_URL:
          "postgresql://vision_local:staging_password@db.internal:5432/vision"
      })
    ).toThrow(ConfigError);
  });

  it("parses database runtime config", () => {
    expect(
      parseDatabaseRuntimeConfig({
        APP_ENV: "test",
        DATABASE_URL:
          "postgresql://vision_test:test_password@localhost:5432/vision_test"
      })
    ).toEqual({
      appEnv: "test",
      databaseUrl:
        "postgresql://vision_test:test_password@localhost:5432/vision_test"
    });
  });

  it("parses database admin config", () => {
    expect(
      parseDatabaseAdminConfig({
        APP_ENV: "local",
        DATABASE_URL: localDatabaseUrl,
        DATABASE_ADMIN_URL: localAdminDatabaseUrl
      })
    ).toEqual({
      appEnv: "local",
      databaseUrl: localDatabaseUrl,
      adminDatabaseUrl: localAdminDatabaseUrl
    });
  });

  it("fails when DATABASE_ADMIN_URL is missing", () => {
    expect(() =>
      parseDatabaseAdminConfig({
        APP_ENV: "local",
        DATABASE_URL: localDatabaseUrl
      })
    ).toThrow(ConfigError);
  });

  it("fails when DATABASE_ADMIN_URL targets the same local database", () => {
    expect(() =>
      parseDatabaseAdminConfig({
        APP_ENV: "local",
        DATABASE_URL: localDatabaseUrl,
        DATABASE_ADMIN_URL: localDatabaseUrl
      })
    ).toThrow(ConfigError);
  });

  it("parses worker config without opening a database connection", () => {
    expect(
      parseWorkerConfig({
        APP_ENV: "test",
        DATABASE_URL:
          "postgresql://vision_test:test_password@localhost:5432/vision_test"
      })
    ).toEqual({
      appEnv: "test",
      databaseUrl:
        "postgresql://vision_test:test_password@localhost:5432/vision_test",
      logLevel: "info"
    });
  });

  it("parses an explicit worker log level", () => {
    expect(
      parseWorkerConfig({
        APP_ENV: "test",
        DATABASE_URL:
          "postgresql://vision_test:test_password@localhost:5432/vision_test",
        LOG_LEVEL: "warn"
      })
    ).toEqual({
      appEnv: "test",
      databaseUrl:
        "postgresql://vision_test:test_password@localhost:5432/vision_test",
      logLevel: "warn"
    });
  });

  it("rejects an invalid worker log level", () => {
    expect(() =>
      parseWorkerConfig({
        APP_ENV: "test",
        DATABASE_URL:
          "postgresql://vision_test:test_password@localhost:5432/vision_test",
        LOG_LEVEL: "trace"
      })
    ).toThrow(ConfigError);
  });

  it("parses frontend config from public variables only", () => {
    const config = parseWebConfig({
      ...validFrontendEnv,
      DATABASE_URL: localDatabaseUrl
    });

    expect(config).toEqual({
      appEnv: "local",
      publicApiBaseUrl: "http://localhost:4000"
    });
    expect("databaseUrl" in config).toBe(false);
  });

  it("uses the same public frontend contract for ERP and platform apps", () => {
    expect(parseErpConfig(validFrontendEnv)).toEqual({
      appEnv: "local",
      publicApiBaseUrl: "http://localhost:4000"
    });
    expect(parsePlatformConfig(validFrontendEnv)).toEqual({
      appEnv: "local",
      publicApiBaseUrl: "http://localhost:4000"
    });
  });
});
```

- [ ] **Step 2: Run config tests and confirm they fail**

Run:

```powershell
corepack pnpm --filter @vision/config test
```

Expected: FAIL because `parseApiConfig` and `parseWorkerConfig` do not include `logLevel` yet.

- [ ] **Step 3: Implement log-level parsing in `packages/config/src/index.ts`**

Replace `packages/config/src/index.ts` with this exact content:

```ts
import { z } from "zod";

const localDatabaseUrl =
  "postgresql://vision_local:vision_local_password@localhost:5432/vision_local";
const localDatabaseAdminUrl =
  "postgresql://vision_local:vision_local_password@localhost:5432/postgres";
const localDatabaseUser = "vision_local";
const localDatabasePassword = "vision_local_password";

const appEnvironmentSchema = z.enum([
  "local",
  "test",
  "staging",
  "production"
]);
const logLevelSchema = z.enum(["debug", "info", "warn", "error"]);

const portSchema = z.coerce.number().int().min(1).max(65535);
const urlSchema = z.string().url();

const databaseRuntimeEnvSchema = z.object({
  APP_ENV: appEnvironmentSchema,
  DATABASE_URL: urlSchema
});

const databaseAdminEnvSchema = databaseRuntimeEnvSchema.extend({
  DATABASE_ADMIN_URL: urlSchema
});

const apiEnvSchema = z.object({
  APP_ENV: appEnvironmentSchema,
  API_HOST: z.string().min(1),
  API_PORT: portSchema,
  DATABASE_URL: urlSchema,
  LOG_LEVEL: logLevelSchema.default("info")
});

const workerEnvSchema = z.object({
  APP_ENV: appEnvironmentSchema,
  DATABASE_URL: urlSchema,
  LOG_LEVEL: logLevelSchema.default("info")
});

const frontendEnvSchema = z.object({
  APP_ENV: appEnvironmentSchema,
  NEXT_PUBLIC_API_BASE_URL: urlSchema
});

export type AppEnvironment = z.infer<typeof appEnvironmentSchema>;
export type LogLevel = z.infer<typeof logLevelSchema>;
export type RuntimeEnv = Record<string, string | undefined>;

export type ApiConfig = {
  appEnv: AppEnvironment;
  host: string;
  port: number;
  databaseUrl: string;
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
  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, "");

  if (!databaseName) {
    throw new ConfigError(["database URL must include a database name"]);
  }

  return databaseName;
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
  const databaseName = getDatabaseName(databaseUrl);
  const usesLocalDefaults =
    databaseUrl === localDatabaseUrl ||
    databaseUrl === localDatabaseAdminUrl ||
    username === localDatabaseUser ||
    password === localDatabasePassword ||
    (parsedUrl.hostname === "localhost" && databaseName === "vision_local");

  if (usesLocalDefaults) {
    throw new ConfigError([
      `${appEnv} DATABASE_URL must not use local database defaults`
    ]);
  }
}

function assertValidAdminDatabaseUrl(
  appEnv: AppEnvironment,
  databaseUrl: string,
  adminDatabaseUrl: string
): void {
  assertSafeDatabaseUrl(appEnv, adminDatabaseUrl);

  if (
    (appEnv === "local" || appEnv === "test") &&
    getDatabaseName(databaseUrl) === getDatabaseName(adminDatabaseUrl)
  ) {
    throw new ConfigError([
      `${appEnv} DATABASE_ADMIN_URL must point to a maintenance database`
    ]);
  }
}

export function parseDatabaseRuntimeConfig(
  env: RuntimeEnv
): DatabaseRuntimeConfig {
  const parsed = parseEnv(databaseRuntimeEnvSchema, env);

  assertSafeDatabaseUrl(parsed.APP_ENV, parsed.DATABASE_URL);

  return {
    appEnv: parsed.APP_ENV,
    databaseUrl: parsed.DATABASE_URL
  };
}

export function parseDatabaseAdminConfig(
  env: RuntimeEnv
): DatabaseAdminConfig {
  const parsed = parseEnv(databaseAdminEnvSchema, env);

  assertSafeDatabaseUrl(parsed.APP_ENV, parsed.DATABASE_URL);
  assertValidAdminDatabaseUrl(
    parsed.APP_ENV,
    parsed.DATABASE_URL,
    parsed.DATABASE_ADMIN_URL
  );

  return {
    appEnv: parsed.APP_ENV,
    databaseUrl: parsed.DATABASE_URL,
    adminDatabaseUrl: parsed.DATABASE_ADMIN_URL
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
    logLevel: parsed.LOG_LEVEL
  };
}

export function parseWorkerConfig(env: RuntimeEnv): WorkerConfig {
  const parsed = parseEnv(workerEnvSchema, env);

  assertSafeDatabaseUrl(parsed.APP_ENV, parsed.DATABASE_URL);

  return {
    appEnv: parsed.APP_ENV,
    databaseUrl: parsed.DATABASE_URL,
    logLevel: parsed.LOG_LEVEL
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
```

- [ ] **Step 4: Update `.env.example`**

Replace `.env.example` with this exact content:

```dotenv
# Vision local development environment
APP_ENV=local

# API and worker runtime
API_HOST=0.0.0.0
API_PORT=4000
DATABASE_URL=postgresql://vision_local:vision_local_password@localhost:5432/vision_local
LOG_LEVEL=info

# Local PostgreSQL container
POSTGRES_DB=vision_local
POSTGRES_USER=vision_local
POSTGRES_PASSWORD=vision_local_password

# Public frontend runtime values
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
```

- [ ] **Step 5: Update local development docs**

Replace `docs/project/local-development.md` with this exact content:

```markdown
# Local Development

Vision local development uses pnpm, Docker Compose, and a local PostgreSQL container.

## Required Tools

- Node.js compatible with the repository toolchain
- Corepack
- Docker Desktop or another Docker Compose compatible runtime

## Environment File

Create a local environment file from the tracked example:

```powershell
Copy-Item .env.example .env
```

Real `.env` files are ignored by Git. Keep local values local.

## PostgreSQL

Start the local database:

```powershell
docker compose up -d postgres
```

Check that PostgreSQL is healthy:

```powershell
docker compose exec -T postgres pg_isready -U vision_local -d vision_local
```

Stop the local database:

```powershell
docker compose down
```

The local database URL is:

```text
postgresql://vision_local:vision_local_password@localhost:5432/vision_local
```

This URL is a local-only default. It must not be used for staging or production.

## Install

Install dependencies:

```powershell
corepack pnpm install
```

## Logging

Phase 4 emits structured JSON logs from the API and worker runtimes.

The default local log level is:

```text
info
```

Override it in `.env` when you need more local detail:

```dotenv
LOG_LEVEL=debug
```

## Verification

Run typechecking:

```powershell
corepack pnpm typecheck
```

Run linting:

```powershell
corepack pnpm lint
```

Run tests:

```powershell
corepack pnpm test
```

Run all three before handing off a development change.
```

- [ ] **Step 6: Run config verification**

Run:

```powershell
corepack pnpm --filter @vision/config test
corepack pnpm --filter @vision/config typecheck
corepack pnpm --filter @vision/config lint
```

Expected: all three commands exit with code 0.

- [ ] **Step 7: Commit the config baseline**

Run:

```powershell
git add .env.example docs/project/local-development.md packages/config/src/index.ts packages/config/src/index.test.ts
git commit -m "feat: add observability runtime log level config"
```

Expected: commit succeeds.

## Task 2: Build The Shared `@vision/observability` Package

**Files:**
- Modify: `packages/observability/package.json`
- Replace: `packages/observability/src/index.ts`
- Create: `packages/observability/src/ids.ts`
- Create: `packages/observability/src/ids.test.ts`
- Create: `packages/observability/src/context.ts`
- Create: `packages/observability/src/context.test.ts`
- Create: `packages/observability/src/problem-details.ts`
- Create: `packages/observability/src/problem-details.test.ts`
- Create: `packages/observability/src/errors.ts`
- Create: `packages/observability/src/errors.test.ts`
- Create: `packages/observability/src/logger.ts`
- Create: `packages/observability/src/logger.test.ts`
- Create: `packages/observability/src/tracing.ts`
- Create: `packages/observability/src/tracing.test.ts`

- [ ] **Step 1: Add failing shared-package tests**

Replace `packages/observability/package.json` with this exact content:

```json
{
  "name": "@vision/observability",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts --out-dir dist",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run"
  }
}
```

Create `packages/observability/src/ids.test.ts` with this exact content:

```ts
import { describe, expect, it } from "vitest";

import {
  createObservabilityId,
  isSafeObservabilityId,
  sanitizeObservabilityId
} from "./ids";

describe("observability ids", () => {
  it("accepts safe header values", () => {
    expect(sanitizeObservabilityId("req-123:abc")).toBe("req-123:abc");
    expect(isSafeObservabilityId("corr_123")).toBe(true);
  });

  it("rejects malformed or oversized values", () => {
    expect(sanitizeObservabilityId("bad value")).toBeUndefined();
    expect(sanitizeObservabilityId("bad\r\nheader")).toBeUndefined();
    expect(sanitizeObservabilityId(`x${"a".repeat(200)}`)).toBeUndefined();
  });

  it("creates safe generated ids", () => {
    const id = createObservabilityId();

    expect(isSafeObservabilityId(id)).toBe(true);
  });
});
```

Create `packages/observability/src/context.test.ts` with this exact content:

```ts
import { describe, expect, it } from "vitest";

import {
  createObservabilityContext,
  extendObservabilityContext
} from "./context";

describe("observability context", () => {
  it("generates missing ids and defaults correlation to request id", () => {
    const context = createObservabilityContext({
      service: "vision-api",
      environment: "test"
    });

    expect(context.requestId).toEqual(expect.any(String));
    expect(context.correlationId).toBe(context.requestId);
    expect(context.service).toBe("vision-api");
    expect(context.environment).toBe("test");
  });

  it("keeps safe upstream ids and optional fields", () => {
    expect(
      createObservabilityContext({
        requestId: "req-123",
        correlationId: "corr-123",
        traceId: "trace-123",
        tenant: "tenant-1"
      })
    ).toEqual({
      requestId: "req-123",
      correlationId: "corr-123",
      traceId: "trace-123",
      tenant: "tenant-1"
    });
  });

  it("extends parent context without losing required ids", () => {
    const parent = createObservabilityContext({
      requestId: "req-123",
      correlationId: "corr-123",
      service: "vision-worker"
    });

    expect(
      extendObservabilityContext(parent, {
        branch: "branch-1"
      })
    ).toEqual({
      requestId: "req-123",
      correlationId: "corr-123",
      service: "vision-worker",
      branch: "branch-1"
    });
  });
});
```

Create `packages/observability/src/problem-details.test.ts` with this exact content:

```ts
import { describe, expect, it } from "vitest";

import {
  createProblemDetails,
  sanitizeProblemInstance
} from "./problem-details";

describe("problem details", () => {
  it("sanitizes instance to a path only", () => {
    expect(
      sanitizeProblemInstance(
        "https://vision.local/appointments?branch=1&provider=2"
      )
    ).toBe("/appointments");
    expect(sanitizeProblemInstance("/health?debug=true")).toBe("/health");
  });

  it("builds a lightweight problem payload", () => {
    expect(
      createProblemDetails({
        type: "https://vision.local/problems/conflict",
        title: "Conflict",
        status: 409,
        detail: "Provider booking overlap.",
        instance: "/appointments?branch=1",
        code: "conflict",
        traceId: "trace-123"
      })
    ).toEqual({
      type: "https://vision.local/problems/conflict",
      title: "Conflict",
      status: 409,
      detail: "Provider booking overlap.",
      instance: "/appointments",
      code: "conflict",
      traceId: "trace-123"
    });
  });
});
```

Create `packages/observability/src/errors.test.ts` with this exact content:

```ts
import { describe, expect, it } from "vitest";

import {
  ProblemError,
  getProblemDefinitionForStatus,
  isProblemError
} from "./errors";

describe("problem errors", () => {
  it("maps common statuses to stable problem definitions", () => {
    expect(getProblemDefinitionForStatus(404)).toEqual({
      type: "https://vision.local/problems/not-found",
      title: "Not Found",
      status: 404,
      code: "not_found"
    });
  });

  it("creates a typed problem error", () => {
    const error = new ProblemError({
      ...getProblemDefinitionForStatus(409),
      detail: "Provider booking overlap."
    });

    expect(isProblemError(error)).toBe(true);
    expect(error.code).toBe("conflict");
    expect(error.status).toBe(409);
  });
});
```

Create `packages/observability/src/logger.test.ts` with this exact content:

```ts
import { describe, expect, it } from "vitest";

import { createLogger } from "./logger";

describe("createLogger", () => {
  it("writes structured JSON with inherited context", () => {
    const entries: string[] = [];
    const logger = createLogger({
      service: "vision-api",
      environment: "test",
      level: "debug",
      sink: (line) => entries.push(line),
      clock: () => new Date("2026-04-20T10:00:00.000Z")
    });

    logger
      .child({
        requestId: "req-123",
        correlationId: "corr-123"
      })
      .info("request.completed", {
        route: "/health",
        error: new Error("hidden stack")
      });

    expect(JSON.parse(entries[0])).toEqual({
      timestamp: "2026-04-20T10:00:00.000Z",
      level: "info",
      service: "vision-api",
      environment: "test",
      message: "request.completed",
      context: {
        requestId: "req-123",
        correlationId: "corr-123"
      },
      meta: {
        route: "/health",
        error: {
          name: "Error",
          message: "hidden stack"
        }
      }
    });
  });

  it("filters entries below the configured level", () => {
    const entries: string[] = [];
    const logger = createLogger({
      service: "vision-worker",
      environment: "test",
      level: "warn",
      sink: (line) => entries.push(line)
    });

    logger.info("worker.idle");
    logger.error("worker.failed");

    expect(entries).toHaveLength(1);
    expect(JSON.parse(entries[0]).message).toBe("worker.failed");
  });
});
```

Create `packages/observability/src/tracing.test.ts` with this exact content:

```ts
import { describe, expect, it } from "vitest";

import { createNoopTracer } from "./tracing";

describe("noop tracer", () => {
  it("returns an active trace without a required trace id", () => {
    const activeTrace = createNoopTracer().startTrace("http.request", {
      requestId: "req-123",
      correlationId: "corr-123"
    });

    expect(activeTrace.traceId).toBeUndefined();
    expect(() => activeTrace.end({ statusCode: 200 })).not.toThrow();
    expect(() => activeTrace.error(new Error("boom"))).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the shared-package tests and confirm they fail**

Run:

```powershell
corepack pnpm --filter @vision/observability test
```

Expected: FAIL because the shared implementation files do not exist yet.

- [ ] **Step 3: Implement the shared observability package**

Create `packages/observability/src/ids.ts` with this exact content:

```ts
import { randomUUID } from "node:crypto";

const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function isSafeObservabilityId(value: string): boolean {
  return SAFE_ID_PATTERN.test(value);
}

export function sanitizeObservabilityId(
  value: string | undefined
): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();

  if (!trimmed || !isSafeObservabilityId(trimmed)) {
    return undefined;
  }

  return trimmed;
}

export function createObservabilityId(): string {
  return randomUUID();
}
```

Create `packages/observability/src/context.ts` with this exact content:

```ts
import {
  createObservabilityId,
  sanitizeObservabilityId
} from "./ids";

export type ObservabilityContext = {
  requestId: string;
  correlationId: string;
  traceId?: string;
  subject?: string;
  tenant?: string;
  branch?: string;
  service?: string;
  environment?: string;
};

export type ObservabilityContextInput = Partial<ObservabilityContext>;

function pickOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
}

export function createObservabilityContext(
  input: ObservabilityContextInput = {}
): ObservabilityContext {
  const requestId =
    sanitizeObservabilityId(input.requestId) ?? createObservabilityId();
  const correlationId =
    sanitizeObservabilityId(input.correlationId) ?? requestId;
  const traceId = sanitizeObservabilityId(input.traceId);

  return {
    requestId,
    correlationId,
    ...(traceId ? { traceId } : {}),
    ...(pickOptionalString(input.subject)
      ? { subject: pickOptionalString(input.subject) }
      : {}),
    ...(pickOptionalString(input.tenant)
      ? { tenant: pickOptionalString(input.tenant) }
      : {}),
    ...(pickOptionalString(input.branch)
      ? { branch: pickOptionalString(input.branch) }
      : {}),
    ...(pickOptionalString(input.service)
      ? { service: pickOptionalString(input.service) }
      : {}),
    ...(pickOptionalString(input.environment)
      ? { environment: pickOptionalString(input.environment) }
      : {})
  };
}

export function extendObservabilityContext(
  parent: ObservabilityContext,
  overrides: ObservabilityContextInput = {}
): ObservabilityContext {
  return createObservabilityContext({
    ...parent,
    ...overrides,
    requestId:
      sanitizeObservabilityId(overrides.requestId) ?? parent.requestId,
    correlationId:
      sanitizeObservabilityId(overrides.correlationId) ??
      parent.correlationId,
    traceId: sanitizeObservabilityId(overrides.traceId) ?? parent.traceId
  });
}
```

Create `packages/observability/src/problem-details.ts` with this exact content:

```ts
export type ProblemCode =
  | "internal_error"
  | "validation_error"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict";

export type ProblemValidationIssue = {
  field: string;
  message: string;
  code?: string;
};

export type ProblemDetails = {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: ProblemCode;
  traceId?: string;
  errors?: ProblemValidationIssue[];
};

export type ProblemDetailsInput = Omit<ProblemDetails, "instance"> & {
  instance?: string;
};

export function sanitizeProblemInstance(value: string | undefined): string {
  if (!value) {
    return "/";
  }

  let source = value;

  if (value.startsWith("http://") || value.startsWith("https://")) {
    try {
      source = new URL(value).pathname;
    } catch {
      source = "/";
    }
  }

  const withoutQuery = source.split("?")[0] ?? "/";
  const withoutHash = withoutQuery.split("#")[0] ?? "/";
  const normalized = withoutHash.startsWith("/")
    ? withoutHash
    : `/${withoutHash}`;

  return normalized || "/";
}

export function createProblemDetails(
  input: ProblemDetailsInput
): ProblemDetails {
  return {
    type: input.type,
    title: input.title,
    status: input.status,
    detail: input.detail,
    instance: sanitizeProblemInstance(input.instance),
    code: input.code,
    ...(input.traceId ? { traceId: input.traceId } : {}),
    ...(input.errors?.length ? { errors: input.errors } : {})
  };
}
```

Create `packages/observability/src/errors.ts` with this exact content:

```ts
import type {
  ProblemCode,
  ProblemValidationIssue
} from "./problem-details";

export type ProblemDefinition = {
  type: string;
  title: string;
  status: number;
  code: ProblemCode;
};

const problemDefinitions: Record<number, ProblemDefinition> = {
  401: {
    type: "https://vision.local/problems/unauthenticated",
    title: "Unauthenticated",
    status: 401,
    code: "unauthenticated"
  },
  403: {
    type: "https://vision.local/problems/forbidden",
    title: "Forbidden",
    status: 403,
    code: "forbidden"
  },
  404: {
    type: "https://vision.local/problems/not-found",
    title: "Not Found",
    status: 404,
    code: "not_found"
  },
  409: {
    type: "https://vision.local/problems/conflict",
    title: "Conflict",
    status: 409,
    code: "conflict"
  },
  422: {
    type: "https://vision.local/problems/validation-error",
    title: "Validation Error",
    status: 422,
    code: "validation_error"
  },
  500: {
    type: "https://vision.local/problems/internal-error",
    title: "Internal Server Error",
    status: 500,
    code: "internal_error"
  }
};

export type ProblemErrorOptions = ProblemDefinition & {
  detail: string;
  errors?: ProblemValidationIssue[];
};

export class ProblemError extends Error {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly code: ProblemCode;
  readonly errors?: ProblemValidationIssue[];

  constructor(options: ProblemErrorOptions) {
    super(options.detail);
    this.name = "ProblemError";
    this.type = options.type;
    this.title = options.title;
    this.status = options.status;
    this.code = options.code;
    this.errors = options.errors;
  }
}

export function isProblemError(error: unknown): error is ProblemError {
  return error instanceof ProblemError;
}

export function getProblemDefinitionForStatus(
  statusCode: number
): ProblemDefinition {
  return problemDefinitions[statusCode] ?? problemDefinitions[500];
}

export function serializeErrorForLog(
  error: unknown
): Record<string, unknown> {
  if (error instanceof ProblemError) {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      status: error.status
    };
  }

  if (error instanceof Error) {
    const candidate = error as Error & {
      code?: string;
      statusCode?: number;
    };

    return {
      name: error.name,
      message: error.message,
      ...(candidate.code ? { code: candidate.code } : {}),
      ...(candidate.statusCode ? { statusCode: candidate.statusCode } : {})
    };
  }

  return {
    value: String(error)
  };
}
```

Create `packages/observability/src/logger.ts` with this exact content:

```ts
import type { ObservabilityContext } from "./context";
import { serializeErrorForLog } from "./errors";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogMetadata = Record<string, unknown>;
export type LogSink = (line: string) => void;
export type Clock = () => Date;

export type VisionLogger = {
  child(context: Partial<ObservabilityContext>): VisionLogger;
  debug(message: string, meta?: LogMetadata): void;
  info(message: string, meta?: LogMetadata): void;
  warn(message: string, meta?: LogMetadata): void;
  error(message: string, meta?: LogMetadata): void;
};

export type CreateLoggerOptions = {
  service: string;
  environment: string;
  level?: LogLevel;
  context?: Partial<ObservabilityContext>;
  sink?: LogSink;
  clock?: Clock;
};

const levelPriority: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

function sanitizeValue(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return serializeErrorForLog(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => sanitizeValue(entry))
      .filter((entry) => entry !== undefined);
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).flatMap(
      ([key, candidate]) => {
        const sanitized = sanitizeValue(candidate);

        return sanitized === undefined ? [] : [[key, sanitized] as const];
      }
    );

    return entries.length ? Object.fromEntries(entries) : undefined;
  }

  return String(value);
}

function sanitizeObject(
  value: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  const sanitized = sanitizeValue(value);

  if (!sanitized || typeof sanitized !== "object" || Array.isArray(sanitized)) {
    return undefined;
  }

  return sanitized as Record<string, unknown>;
}

function defaultSink(line: string): void {
  console.log(line);
}

export function createLogger(options: CreateLoggerOptions): VisionLogger {
  const level = options.level ?? "info";
  const sink = options.sink ?? defaultSink;
  const clock = options.clock ?? (() => new Date());
  const baseContext = sanitizeObject(
    options.context as Record<string, unknown> | undefined
  );

  function write(
    entryLevel: LogLevel,
    message: string,
    meta?: LogMetadata
  ): void {
    if (levelPriority[entryLevel] < levelPriority[level]) {
      return;
    }

    const sanitizedMeta = sanitizeObject(meta);
    const record = {
      timestamp: clock().toISOString(),
      level: entryLevel,
      service: options.service,
      environment: options.environment,
      message,
      ...(baseContext ? { context: baseContext } : {}),
      ...(sanitizedMeta ? { meta: sanitizedMeta } : {})
    };

    sink(JSON.stringify(record));
  }

  return {
    child(context) {
      return createLogger({
        ...options,
        level,
        sink,
        clock,
        context: {
          ...(options.context ?? {}),
          ...context
        }
      });
    },
    debug(message, meta) {
      write("debug", message, meta);
    },
    info(message, meta) {
      write("info", message, meta);
    },
    warn(message, meta) {
      write("warn", message, meta);
    },
    error(message, meta) {
      write("error", message, meta);
    }
  };
}
```

Create `packages/observability/src/tracing.ts` with this exact content:

```ts
import type { ObservabilityContext } from "./context";

export type ActiveTrace = {
  traceId?: string;
  end(meta?: Record<string, unknown>): void;
  error(error: unknown): void;
};

export type ObservabilityTracer = {
  startTrace(name: string, context: ObservabilityContext): ActiveTrace;
};

export function createNoopTracer(): ObservabilityTracer {
  return {
    startTrace(_name, _context) {
      return {
        end() {},
        error() {}
      };
    }
  };
}
```

Replace `packages/observability/src/index.ts` with this exact content:

```ts
export {
  createObservabilityContext,
  extendObservabilityContext,
  type ObservabilityContext,
  type ObservabilityContextInput
} from "./context";
export {
  ProblemError,
  getProblemDefinitionForStatus,
  isProblemError,
  serializeErrorForLog,
  type ProblemDefinition,
  type ProblemErrorOptions
} from "./errors";
export {
  createObservabilityId,
  isSafeObservabilityId,
  sanitizeObservabilityId
} from "./ids";
export {
  createLogger,
  type Clock,
  type CreateLoggerOptions,
  type LogLevel,
  type LogMetadata,
  type LogSink,
  type VisionLogger
} from "./logger";
export {
  createProblemDetails,
  sanitizeProblemInstance,
  type ProblemCode,
  type ProblemDetails,
  type ProblemDetailsInput,
  type ProblemValidationIssue
} from "./problem-details";
export {
  createNoopTracer,
  type ActiveTrace,
  type ObservabilityTracer
} from "./tracing";
```

- [ ] **Step 4: Run shared-package verification**

Run:

```powershell
corepack pnpm --filter @vision/observability test
corepack pnpm --filter @vision/observability typecheck
corepack pnpm --filter @vision/observability lint
```

Expected: all three commands exit with code 0.

- [ ] **Step 5: Commit the shared observability package**

Run:

```powershell
git add packages/observability/package.json packages/observability/src/index.ts packages/observability/src/ids.ts packages/observability/src/ids.test.ts packages/observability/src/context.ts packages/observability/src/context.test.ts packages/observability/src/problem-details.ts packages/observability/src/problem-details.test.ts packages/observability/src/errors.ts packages/observability/src/errors.test.ts packages/observability/src/logger.ts packages/observability/src/logger.test.ts packages/observability/src/tracing.ts packages/observability/src/tracing.test.ts
git commit -m "feat: add shared observability baseline package"
```

Expected: commit succeeds.

## Task 3: Wire API Request Context, Logging, And Problem Responses

**Files:**
- Modify: `apps/api/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/src/runtime.ts`
- Modify: `apps/api/src/runtime.test.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/server.test.ts`
- Create: `apps/api/src/fastify-types.ts`
- Create: `apps/api/src/request-context.ts`
- Create: `apps/api/src/request-context.test.ts`
- Create: `apps/api/src/http-errors.ts`

- [ ] **Step 1: Add the API dependency and failing API tests**

Replace `apps/api/package.json` with this exact content:

```json
{
  "name": "@vision/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsup src/index.ts --format esm --dts --out-dir dist",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run"
  },
  "dependencies": {
    "@vision/config": "workspace:*",
    "@vision/observability": "workspace:*",
    "fastify": "latest"
  }
}
```

Replace `apps/api/src/runtime.test.ts` with this exact content:

```ts
import { ConfigError } from "@vision/config";
import { describe, expect, it } from "vitest";

import { getApiListenOptions, getApiRuntimeConfig } from "./runtime";

const validApiEnv = {
  APP_ENV: "local",
  API_HOST: "127.0.0.1",
  API_PORT: "4000",
  DATABASE_URL:
    "postgresql://vision_local:vision_local_password@localhost:5432/vision_local",
  LOG_LEVEL: "debug"
};

describe("getApiRuntimeConfig", () => {
  it("maps validated API config to runtime settings", () => {
    expect(getApiRuntimeConfig(validApiEnv)).toEqual({
      appEnv: "local",
      host: "127.0.0.1",
      port: 4000,
      logLevel: "debug",
      serviceName: "vision-api"
    });
  });

  it("maps runtime config to Fastify listen options", () => {
    expect(getApiListenOptions(validApiEnv)).toEqual({
      host: "127.0.0.1",
      port: 4000
    });
  });

  it("fails before startup when API config is invalid", () => {
    const { DATABASE_URL: _databaseUrl, ...missingDatabaseUrlEnv } =
      validApiEnv;

    expect(() => getApiRuntimeConfig(missingDatabaseUrlEnv)).toThrow(
      ConfigError
    );
  });
});
```

Create `apps/api/src/request-context.test.ts` with this exact content:

```ts
import { describe, expect, it } from "vitest";

import { createApiRequestContext } from "./request-context";

const runtime = {
  appEnv: "test",
  serviceName: "vision-api"
} as const;

describe("createApiRequestContext", () => {
  it("regenerates malformed request ids and keeps a safe correlation id", () => {
    const context = createApiRequestContext(
      {
        headers: {
          "x-request-id": "bad value",
          "x-correlation-id": "corr-123"
        }
      },
      runtime
    );

    expect(context.requestId).toEqual(expect.any(String));
    expect(context.requestId).not.toBe("bad value");
    expect(context.correlationId).toBe("corr-123");
    expect(context.service).toBe("vision-api");
    expect(context.environment).toBe("test");
  });

  it("uses a safe upstream request id for both fields when correlation is missing", () => {
    const context = createApiRequestContext(
      {
        headers: {
          "x-request-id": "req-123"
        }
      },
      runtime
    );

    expect(context).toEqual({
      requestId: "req-123",
      correlationId: "req-123",
      service: "vision-api",
      environment: "test"
    });
  });
});
```

Replace `apps/api/src/server.test.ts` with this exact content:

```ts
import { describe, expect, it } from "vitest";

import {
  ProblemError,
  createLogger,
  createNoopTracer,
  getProblemDefinitionForStatus
} from "@vision/observability";

import { buildApi } from "./server";

function buildTestApi() {
  const entries: string[] = [];
  const api = buildApi({
    runtime: {
      appEnv: "test",
      host: "127.0.0.1",
      port: 4000,
      logLevel: "debug",
      serviceName: "vision-api"
    },
    logger: createLogger({
      service: "vision-api",
      environment: "test",
      level: "debug",
      sink: (line) => entries.push(line)
    }),
    tracer: createNoopTracer()
  });

  return {
    api,
    entries
  };
}

describe("buildApi", () => {
  it("responds to the health route with sanitized observability headers", async () => {
    const { api, entries } = buildTestApi();

    const response = await api.inject({
      method: "GET",
      url: "/health?debug=true",
      headers: {
        "x-request-id": "bad value",
        "x-correlation-id": "corr-123"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-request-id"]).toEqual(expect.any(String));
    expect(response.headers["x-request-id"]).not.toBe("bad value");
    expect(response.headers["x-correlation-id"]).toBe("corr-123");
    expect(response.json()).toEqual({
      service: "vision-api",
      status: "ok"
    });
    expect(JSON.parse(entries[0])).toMatchObject({
      message: "request.completed",
      meta: {
        method: "GET",
        route: "/health",
        statusCode: 200
      }
    });

    await api.close();
  });

  it("maps typed application errors to Problem Details", async () => {
    const { api } = buildTestApi();

    api.get("/conflict", async () => {
      throw new ProblemError({
        ...getProblemDefinitionForStatus(409),
        detail: "Provider booking overlap."
      });
    });

    const response = await api.inject({
      method: "GET",
      url: "/conflict?slot=1"
    });

    expect(response.statusCode).toBe(409);
    expect(response.headers["content-type"]).toContain(
      "application/problem+json"
    );
    expect(response.json()).toEqual({
      type: "https://vision.local/problems/conflict",
      title: "Conflict",
      status: 409,
      detail: "Provider booking overlap.",
      instance: "/conflict",
      code: "conflict"
    });

    await api.close();
  });

  it("maps Fastify validation errors to a lightweight validation problem", async () => {
    const { api } = buildTestApi();

    api.get(
      "/search",
      {
        schema: {
          querystring: {
            type: "object",
            required: ["limit"],
            properties: {
              limit: {
                type: "number",
                minimum: 1
              }
            }
          }
        }
      },
      async () => ({
        ok: true
      })
    );

    const response = await api.inject({
      method: "GET",
      url: "/search?limit=zero"
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({
      type: "https://vision.local/problems/validation-error",
      title: "Validation Error",
      status: 422,
      instance: "/search",
      code: "validation_error",
      errors: [
        {
          field: "querystring.limit"
        }
      ]
    });

    await api.close();
  });

  it("hides unexpected failures behind a safe 500 payload", async () => {
    const { api } = buildTestApi();

    api.get("/boom", async () => {
      throw new Error("database password leaked");
    });

    const response = await api.inject({
      method: "GET",
      url: "/boom?raw=true"
    });

    expect(response.statusCode).toBe(500);
    expect(response.headers["content-type"]).toContain(
      "application/problem+json"
    );
    expect(response.json()).toEqual({
      type: "https://vision.local/problems/internal-error",
      title: "Internal Server Error",
      status: 500,
      detail: "An unexpected error occurred.",
      instance: "/boom",
      code: "internal_error"
    });
    expect(response.body).not.toContain("database password leaked");

    await api.close();
  });
});
```

- [ ] **Step 2: Refresh workspace links**

Run:

```powershell
corepack pnpm install
```

Expected: `pnpm-lock.yaml` updates to reflect the new `@vision/observability` workspace dependency for `@vision/api`.

- [ ] **Step 3: Run the API tests and confirm they fail**

Run:

```powershell
corepack pnpm --filter @vision/api test
```

Expected: FAIL because the API does not have request-context, error-mapping, or shared logger integration yet.

- [ ] **Step 4: Implement the API observability adapter**

Replace `apps/api/src/runtime.ts` with this exact content:

```ts
import { parseApiConfig } from "@vision/config";

export type ApiRuntimeConfig = {
  appEnv: "local" | "test" | "staging" | "production";
  host: string;
  port: number;
  logLevel: "debug" | "info" | "warn" | "error";
  serviceName: "vision-api";
};

export type ApiListenOptions = Pick<ApiRuntimeConfig, "host" | "port">;

export function getApiRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env
): ApiRuntimeConfig {
  const config = parseApiConfig(env);

  return {
    appEnv: config.appEnv,
    host: config.host,
    port: config.port,
    logLevel: config.logLevel,
    serviceName: "vision-api"
  };
}

export function getApiListenOptions(
  env: NodeJS.ProcessEnv = process.env
): ApiListenOptions {
  const { host, port } = getApiRuntimeConfig(env);

  return {
    host,
    port
  };
}
```

Create `apps/api/src/fastify-types.ts` with this exact content:

```ts
import type {
  ActiveTrace,
  ObservabilityContext,
  VisionLogger
} from "@vision/observability";

declare module "fastify" {
  interface FastifyRequest {
    activeTrace: ActiveTrace | null;
    observabilityContext: ObservabilityContext | null;
    requestLogger: VisionLogger | null;
    requestStartedAt: number | null;
  }
}

export {};
```

Create `apps/api/src/request-context.ts` with this exact content:

```ts
import { createObservabilityContext } from "@vision/observability";

type HeaderValue = string | string[] | undefined;

type RequestLike = {
  headers: Record<string, HeaderValue>;
};

type RuntimeLike = {
  appEnv: string;
  serviceName: string;
};

function getFirstHeaderValue(value: HeaderValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function createApiRequestContext(
  request: RequestLike,
  runtime: RuntimeLike
) {
  const requestId = getFirstHeaderValue(request.headers["x-request-id"]);
  const correlationId = getFirstHeaderValue(
    request.headers["x-correlation-id"]
  );

  return createObservabilityContext({
    requestId,
    correlationId: correlationId ?? requestId,
    service: runtime.serviceName,
    environment: runtime.appEnv
  });
}
```

Create `apps/api/src/http-errors.ts` with this exact content:

```ts
import type { FastifyRequest } from "fastify";

import {
  ProblemError,
  createProblemDetails,
  getProblemDefinitionForStatus,
  isProblemError,
  sanitizeProblemInstance,
  type ObservabilityContext,
  type ProblemDetails,
  type ProblemValidationIssue
} from "@vision/observability";

type FastifyValidationError = {
  statusCode?: number;
  validation?: Array<{
    instancePath?: string;
    message?: string;
  }>;
  validationContext?: string;
};

function hasStatusCode(error: unknown): error is { statusCode: number } {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof (error as { statusCode: unknown }).statusCode === "number"
  );
}

function isFastifyValidationError(
  error: unknown
): error is FastifyValidationError {
  return (
    hasStatusCode(error) &&
    Array.isArray((error as FastifyValidationError).validation)
  );
}

function formatValidationIssue(
  error: FastifyValidationError,
  issue: { instancePath?: string; message?: string }
): ProblemValidationIssue {
  const context = error.validationContext ?? "request";
  const path = issue.instancePath
    ?.replace(/^\//, "")
    .replace(/\//g, ".");

  return {
    field: path ? `${context}.${path}` : context,
    message: issue.message ?? "Invalid value"
  };
}

export function mapApiErrorToProblem(
  error: unknown,
  request: Pick<FastifyRequest, "routeOptions" | "url">,
  context: ObservabilityContext
): {
  statusCode: number;
  problem: ProblemDetails;
} {
  const instance = sanitizeProblemInstance(request.routeOptions.url ?? request.url);

  if (isProblemError(error)) {
    return {
      statusCode: error.status,
      problem: createProblemDetails({
        type: error.type,
        title: error.title,
        status: error.status,
        detail: error.message,
        instance,
        code: error.code,
        traceId: context.traceId,
        errors: error.errors
      })
    };
  }

  if (isFastifyValidationError(error)) {
    const definition = getProblemDefinitionForStatus(422);

    return {
      statusCode: 422,
      problem: createProblemDetails({
        ...definition,
        detail: "Request validation failed.",
        instance,
        code: definition.code,
        traceId: context.traceId,
        errors:
          error.validation?.map((issue) =>
            formatValidationIssue(error, issue)
          ) ?? []
      })
    };
  }

  const definition = hasStatusCode(error)
    ? getProblemDefinitionForStatus(error.statusCode)
    : getProblemDefinitionForStatus(500);
  const detail =
    definition.status === 500
      ? "An unexpected error occurred."
      : definition.title;

  return {
    statusCode: definition.status,
    problem: createProblemDetails({
      ...definition,
      detail,
      instance,
      traceId: context.traceId
    })
  };
}
```

Replace `apps/api/src/server.ts` with this exact content:

```ts
import Fastify, { type FastifyInstance } from "fastify";

import {
  createLogger,
  createNoopTracer,
  extendObservabilityContext,
  sanitizeProblemInstance,
  type ObservabilityTracer,
  type VisionLogger
} from "@vision/observability";

import "./fastify-types";
import { mapApiErrorToProblem } from "./http-errors";
import { createApiRequestContext } from "./request-context";
import {
  getApiRuntimeConfig,
  type ApiRuntimeConfig
} from "./runtime";

export type ApiBuildDependencies = {
  runtime: ApiRuntimeConfig;
  logger: VisionLogger;
  tracer: ObservabilityTracer;
};

export function buildApi(
  overrides: Partial<ApiBuildDependencies> = {}
): FastifyInstance {
  const runtime = overrides.runtime ?? getApiRuntimeConfig();
  const rootLogger =
    overrides.logger ??
    createLogger({
      service: runtime.serviceName,
      environment: runtime.appEnv,
      level: runtime.logLevel
    });
  const tracer = overrides.tracer ?? createNoopTracer();
  const api = Fastify({
    logger: false
  });

  api.decorateRequest("activeTrace", null);
  api.decorateRequest("observabilityContext", null);
  api.decorateRequest("requestLogger", null);
  api.decorateRequest("requestStartedAt", null);

  api.addHook("onRequest", async (request, reply) => {
    request.requestStartedAt = Date.now();

    const baseContext = createApiRequestContext(request, runtime);
    const activeTrace = tracer.startTrace("http.request", baseContext);
    const context = activeTrace.traceId
      ? extendObservabilityContext(baseContext, {
          traceId: activeTrace.traceId
        })
      : baseContext;

    request.activeTrace = activeTrace;
    request.observabilityContext = context;
    request.requestLogger = rootLogger.child(context);

    reply.header("x-request-id", context.requestId);
    reply.header("x-correlation-id", context.correlationId);
  });

  api.addHook("onResponse", async (request, reply) => {
    const context =
      request.observabilityContext ??
      createApiRequestContext(request, runtime);
    const requestLogger = request.requestLogger ?? rootLogger.child(context);
    const durationMs = Math.max(
      0,
      Date.now() - (request.requestStartedAt ?? Date.now())
    );

    request.activeTrace?.end({
      statusCode: reply.statusCode
    });

    requestLogger.info("request.completed", {
      method: request.method,
      route: sanitizeProblemInstance(request.routeOptions.url ?? request.url),
      statusCode: reply.statusCode,
      durationMs
    });
  });

  api.setErrorHandler((error, request, reply) => {
    const context =
      request.observabilityContext ??
      createApiRequestContext(request, runtime);
    const requestLogger = request.requestLogger ?? rootLogger.child(context);
    const { statusCode, problem } = mapApiErrorToProblem(
      error,
      request,
      context
    );

    request.activeTrace?.error(error);

    requestLogger.error("request.failed", {
      method: request.method,
      route: sanitizeProblemInstance(request.routeOptions.url ?? request.url),
      statusCode,
      problem,
      error
    });

    reply
      .type("application/problem+json")
      .code(statusCode)
      .header("x-request-id", context.requestId)
      .header("x-correlation-id", context.correlationId)
      .send(problem);
  });

  api.get("/health", async () => ({
    service: runtime.serviceName,
    status: "ok"
  }));

  return api;
}
```

Replace `apps/api/src/index.ts` with this exact content:

```ts
import { createLogger } from "@vision/observability";

import { getApiRuntimeConfig } from "./runtime";
import { buildApi } from "./server";

const runtime = getApiRuntimeConfig();
const logger = createLogger({
  service: runtime.serviceName,
  environment: runtime.appEnv,
  level: runtime.logLevel
});
const api = buildApi({
  runtime,
  logger
});

try {
  await api.listen({
    host: runtime.host,
    port: runtime.port
  });

  logger.info("api.started", {
    host: runtime.host,
    port: runtime.port
  });
} catch (error: unknown) {
  logger.error("api.start_failed", {
    error
  });
  process.exit(1);
}
```

- [ ] **Step 5: Run API verification**

Run:

```powershell
corepack pnpm --filter @vision/api test
corepack pnpm --filter @vision/api typecheck
corepack pnpm --filter @vision/api lint
```

Expected: all three commands exit with code 0.

- [ ] **Step 6: Commit the API observability slice**

Run:

```powershell
git add apps/api/package.json apps/api/src/index.ts apps/api/src/runtime.ts apps/api/src/runtime.test.ts apps/api/src/server.ts apps/api/src/server.test.ts apps/api/src/fastify-types.ts apps/api/src/request-context.ts apps/api/src/request-context.test.ts apps/api/src/http-errors.ts pnpm-lock.yaml
git commit -m "feat: add api observability baseline"
```

Expected: commit succeeds.

## Task 4: Wire Worker Logging And Phase 4 Documentation

**Files:**
- Modify: `apps/worker/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/worker/src/index.ts`
- Create: `apps/worker/src/runtime.ts`
- Create: `apps/worker/src/runtime.test.ts`
- Create: `apps/worker/src/context.ts`
- Create: `apps/worker/src/context.test.ts`
- Create: `apps/worker/src/logging.ts`
- Create: `apps/worker/src/logging.test.ts`
- Create: `docs/architecture/observability-baseline.md`
- Create: `docs/security/logging-and-error-safety.md`

- [ ] **Step 1: Add the worker dependency and failing worker tests**

Replace `apps/worker/package.json` with this exact content:

```json
{
  "name": "@vision/worker",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsup src/index.ts --format esm --dts --out-dir dist",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run"
  },
  "dependencies": {
    "@vision/config": "workspace:*",
    "@vision/observability": "workspace:*"
  }
}
```

Create `apps/worker/src/runtime.test.ts` with this exact content:

```ts
import { ConfigError } from "@vision/config";
import { describe, expect, it } from "vitest";

import { getWorkerRuntimeConfig } from "./runtime";

const validWorkerEnv = {
  APP_ENV: "test",
  DATABASE_URL:
    "postgresql://vision_test:test_password@localhost:5432/vision_test",
  LOG_LEVEL: "warn"
};

describe("getWorkerRuntimeConfig", () => {
  it("maps validated worker config to runtime settings", () => {
    expect(getWorkerRuntimeConfig(validWorkerEnv)).toEqual({
      appEnv: "test",
      databaseUrl:
        "postgresql://vision_test:test_password@localhost:5432/vision_test",
      logLevel: "warn",
      serviceName: "vision-worker"
    });
  });

  it("fails before startup when worker config is invalid", () => {
    const { DATABASE_URL: _databaseUrl, ...missingDatabaseUrlEnv } =
      validWorkerEnv;

    expect(() => getWorkerRuntimeConfig(missingDatabaseUrlEnv)).toThrow(
      ConfigError
    );
  });
});
```

Create `apps/worker/src/context.test.ts` with this exact content:

```ts
import { describe, expect, it } from "vitest";

import { createWorkerOperationContext } from "./context";

describe("createWorkerOperationContext", () => {
  it("creates required baseline worker context", () => {
    const context = createWorkerOperationContext({
      appEnv: "test",
      serviceName: "vision-worker"
    });

    expect(context.requestId).toEqual(expect.any(String));
    expect(context.correlationId).toBe(context.requestId);
    expect(context.service).toBe("vision-worker");
    expect(context.environment).toBe("test");
  });

  it("preserves an inherited correlation id", () => {
    const context = createWorkerOperationContext(
      {
        appEnv: "test",
        serviceName: "vision-worker"
      },
      {
        correlationId: "corr-123"
      }
    );

    expect(context.correlationId).toBe("corr-123");
    expect(context.requestId).toEqual(expect.any(String));
  });
});
```

Create `apps/worker/src/logging.test.ts` with this exact content:

```ts
import { describe, expect, it } from "vitest";

import { createLogger } from "@vision/observability";

import { createWorkerOperationContext } from "./context";
import { logWorkerIdle, logWorkerStartup } from "./logging";

const runtime = {
  appEnv: "test",
  databaseUrl:
    "postgresql://vision_test:test_password@localhost:5432/vision_test",
  logLevel: "debug",
  serviceName: "vision-worker"
} as const;

describe("worker logging", () => {
  it("emits structured startup and idle logs", () => {
    const entries: string[] = [];
    const logger = createLogger({
      service: "vision-worker",
      environment: "test",
      level: "debug",
      sink: (line) => entries.push(line),
      clock: () => new Date("2026-04-20T12:00:00.000Z")
    });
    const context = createWorkerOperationContext(runtime);

    logWorkerStartup(logger, context, runtime);
    logWorkerIdle(logger, context, runtime.appEnv);

    expect(JSON.parse(entries[0])).toMatchObject({
      timestamp: "2026-04-20T12:00:00.000Z",
      level: "info",
      message: "worker.started",
      context: {
        requestId: context.requestId,
        correlationId: context.correlationId
      },
      meta: {
        event: "startup",
        databaseConfigured: true
      }
    });

    expect(JSON.parse(entries[1])).toMatchObject({
      timestamp: "2026-04-20T12:00:00.000Z",
      level: "info",
      message: "worker.idle",
      context: {
        requestId: context.requestId,
        correlationId: context.correlationId
      },
      meta: {
        event: "idle",
        status: "idle"
      }
    });
  });
});
```

- [ ] **Step 2: Refresh workspace links**

Run:

```powershell
corepack pnpm install
```

Expected: `pnpm-lock.yaml` updates to reflect the new `@vision/observability` workspace dependency for `@vision/worker`.

- [ ] **Step 3: Run the worker tests and confirm they fail**

Run:

```powershell
corepack pnpm --filter @vision/worker test
```

Expected: FAIL because the worker runtime, context, and logging adapters do not exist yet.

- [ ] **Step 4: Implement the worker adapter**

Create `apps/worker/src/runtime.ts` with this exact content:

```ts
import { parseWorkerConfig } from "@vision/config";

export type WorkerRuntimeConfig = {
  appEnv: "local" | "test" | "staging" | "production";
  databaseUrl: string;
  logLevel: "debug" | "info" | "warn" | "error";
  serviceName: "vision-worker";
};

export function getWorkerRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env
): WorkerRuntimeConfig {
  const config = parseWorkerConfig(env);

  return {
    appEnv: config.appEnv,
    databaseUrl: config.databaseUrl,
    logLevel: config.logLevel,
    serviceName: "vision-worker"
  };
}
```

Create `apps/worker/src/context.ts` with this exact content:

```ts
import {
  createObservabilityContext,
  type ObservabilityContext,
  type ObservabilityContextInput
} from "@vision/observability";

type RuntimeLike = {
  appEnv: string;
  serviceName: string;
};

export function createWorkerOperationContext(
  runtime: RuntimeLike,
  input: ObservabilityContextInput = {}
): ObservabilityContext {
  return createObservabilityContext({
    ...input,
    service: runtime.serviceName,
    environment: runtime.appEnv
  });
}
```

Create `apps/worker/src/logging.ts` with this exact content:

```ts
import type {
  ObservabilityContext,
  VisionLogger
} from "@vision/observability";

import { getWorkerStatus } from "./status";

type WorkerRuntimeLike = {
  appEnv: "local" | "test" | "staging" | "production";
  databaseUrl: string;
};

export function logWorkerStartup(
  logger: VisionLogger,
  context: ObservabilityContext,
  runtime: WorkerRuntimeLike
): void {
  logger.child(context).info("worker.started", {
    event: "startup",
    databaseConfigured: Boolean(runtime.databaseUrl)
  });
}

export function logWorkerIdle(
  logger: VisionLogger,
  context: ObservabilityContext,
  environment: WorkerRuntimeLike["appEnv"]
): void {
  logger.child(context).info("worker.idle", {
    event: "idle",
    status: getWorkerStatus(environment).status
  });
}
```

Replace `apps/worker/src/index.ts` with this exact content:

```ts
import { createLogger } from "@vision/observability";

import { createWorkerOperationContext } from "./context";
import { logWorkerIdle, logWorkerStartup } from "./logging";
import { getWorkerRuntimeConfig } from "./runtime";

const runtime = getWorkerRuntimeConfig();
const logger = createLogger({
  service: runtime.serviceName,
  environment: runtime.appEnv,
  level: runtime.logLevel
});
const startupContext = createWorkerOperationContext(runtime);
const idleContext = createWorkerOperationContext(runtime, {
  correlationId: startupContext.correlationId
});

logWorkerStartup(logger, startupContext, runtime);
logWorkerIdle(logger, idleContext, runtime.appEnv);
```

- [ ] **Step 5: Add Phase 4 documentation**

Create `docs/architecture/observability-baseline.md` with this exact content:

```markdown
# Observability Baseline

Phase 4 establishes a shared observability baseline before auth, tenancy, and domain behavior expand.

## Shared Package Boundary

`@vision/observability` owns:

- request and correlation ID validation and generation
- shared observability context types
- child logger creation and structured JSON output
- Problem Details payload types and helpers
- baseline problem/error helpers
- tracing hook types and the default no-op tracer

## API Boundary

`apps/api` owns:

- reading `x-request-id` and `x-correlation-id`
- regenerating unsafe incoming values
- attaching request-scoped context
- returning sanitized IDs in response headers
- mapping framework and application errors to Problem Details responses

## Worker Boundary

`apps/worker` owns:

- creating non-HTTP operation context
- structured startup logs
- structured idle or operation logs

## Required Context Fields

Every baseline context includes:

- `requestId`
- `correlationId`

`traceId` is optional and comes from the tracing hook only when available.

Reserved optional fields for later phases include:

- `subject`
- `tenant`
- `branch`

## Explicit Non-Goals

Phase 4 does not add:

- exporter deployment wiring
- provider rollout setup
- collector integration
- dashboards
- alerts
- telemetry vendor-specific configuration
```

Create `docs/security/logging-and-error-safety.md` with this exact content:

```markdown
# Logging And Error Safety

Phase 4 introduces structured logs and a lightweight Problem Details response model. This baseline must stay safe by default.

## Log Safety Rules

- Do not log secrets.
- Do not log passwords.
- Do not log raw MFA material.
- Do not dump full exception objects into default logs.
- Do not log unnecessary PII.

Structured error serialization should keep only the minimum safe fields needed for debugging, such as error name, message, stable code, and status when available.

## Client Error Payload Rules

Problem Details responses may include:

- `type`
- `title`
- `status`
- `detail`
- `instance`
- stable `code`
- optional `traceId`
- optional `errors` for validation failures

Problem Details responses must not include:

- stack traces
- raw exceptions
- secrets
- full URLs with query strings
- unnecessary PII

## Instance Rules

`instance` must be a sanitized request path only. Query strings and full URLs must not be echoed back to clients.

## Header Rules

Incoming `x-request-id` and `x-correlation-id` values must be validated. Unsafe values must be replaced with sanitized generated values before they are stored in context or returned in response headers.
```

- [ ] **Step 6: Run worker and docs verification**

Run:

```powershell
corepack pnpm --filter @vision/worker test
corepack pnpm --filter @vision/worker typecheck
corepack pnpm --filter @vision/worker lint
```

Expected: all three commands exit with code 0.

- [ ] **Step 7: Commit the worker and documentation slice**

Run:

```powershell
git add apps/worker/package.json apps/worker/src/index.ts apps/worker/src/runtime.ts apps/worker/src/runtime.test.ts apps/worker/src/context.ts apps/worker/src/context.test.ts apps/worker/src/logging.ts apps/worker/src/logging.test.ts docs/architecture/observability-baseline.md docs/security/logging-and-error-safety.md pnpm-lock.yaml
git commit -m "feat: add worker observability baseline"
```

Expected: commit succeeds.

## Task 5: Run Full Verification And Close The Phase

**Files:**
- Verify all Phase 4 files

- [ ] **Step 1: Run the targeted package test suites**

Run:

```powershell
corepack pnpm --filter @vision/config test
corepack pnpm --filter @vision/observability test
corepack pnpm --filter @vision/api test
corepack pnpm --filter @vision/worker test
```

Expected: every command exits with code 0.

- [ ] **Step 2: Run workspace verification**

Run:

```powershell
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
```

Expected: every command exits with code 0.

- [ ] **Step 3: Check git status**

Run:

```powershell
git status --short --branch
```

Expected: working tree is clean. If any intended Phase 4 file remains uncommitted, add and commit it before handoff.

- [ ] **Step 4: Sanity-scan Phase 4 boundaries**

Run:

```powershell
Select-String -Path 'docs/architecture/observability-baseline.md','docs/security/logging-and-error-safety.md','docs/superpowers/specs/2026-04-20-phase-4-observability-baseline-design.md' -Pattern 'exporter|collector|dashboard|alert|vendor'
```

Expected: the documentation references these topics only as explicit non-goals, not as implementation steps.

## Self-Review

- Spec coverage: Task 1 adds the minimal runtime config needed to keep logging coherent without telemetry sprawl. Task 2 turns `@vision/observability` into the shared baseline for IDs, context, logger creation, problem payloads, error helpers, and tracing hooks. Task 3 keeps HTTP/Fastify error mapping in `apps/api` while adding validated request/correlation IDs, response headers, structured completion logs, and safe Problem Details responses. Task 4 creates non-HTTP worker context and structured worker logs while documenting architecture and safety boundaries. Task 5 verifies the full workspace and re-checks the explicit non-goals.
- Plan-failure scan: The document avoids empty handoff phrases and keeps every code-edit step concrete, with exact file content, exact commands, and expected outcomes.
- Type consistency: `LOG_LEVEL` is defined in `@vision/config` before API and worker runtime helpers use it. Shared types and helpers are exported from `@vision/observability` before API and worker files import them. Request and correlation IDs stay required in shared context, while `traceId` remains optional throughout the plan. HTTP-only mapping stays in `apps/api`, and the shared package remains transport-agnostic.
