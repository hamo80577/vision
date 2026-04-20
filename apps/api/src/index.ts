import { createLogger, type LogLevel, type VisionLogger } from "@vision/observability";

import type { AppEnvironment } from "@vision/config";

import { getApiRuntimeConfig } from "./runtime";
import { buildApi } from "./server";

const APP_ENVIRONMENTS = ["local", "test", "staging", "production"] as const;
const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

function getBootstrapEnvironment(env: NodeJS.ProcessEnv): AppEnvironment {
  const candidate = env.APP_ENV;

  if (
    typeof candidate === "string" &&
    (APP_ENVIRONMENTS as readonly string[]).includes(candidate)
  ) {
    return candidate as AppEnvironment;
  }

  return "local";
}

function getBootstrapLogLevel(env: NodeJS.ProcessEnv): LogLevel {
  const candidate = env.LOG_LEVEL;

  if (typeof candidate === "string" && (LOG_LEVELS as readonly string[]).includes(candidate)) {
    return candidate as LogLevel;
  }

  return "error";
}

function createBootstrapLogger(env: NodeJS.ProcessEnv): VisionLogger {
  return createLogger({
    service: "vision-api",
    environment: getBootstrapEnvironment(env),
    level: getBootstrapLogLevel(env)
  });
}

let logger: VisionLogger | undefined;

try {
  const runtime = getApiRuntimeConfig();
  logger = createLogger({
    service: runtime.serviceName,
    environment: runtime.appEnv,
    level: runtime.logLevel
  });
  const api = buildApi({
    runtime,
    logger
  });

  await api.listen({
    host: runtime.host,
    port: runtime.port
  });

  logger.info("api.started", {
    host: runtime.host,
    port: runtime.port
  });
} catch (error: unknown) {
  const startupLogger = logger ?? createBootstrapLogger(process.env);

  startupLogger.error("api.start_failed", {
    error
  });
  process.exit(1);
}
