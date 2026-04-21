import {
  createLogger,
  createObservabilityContext,
  type LogLevel
} from "@vision/observability";

import { createWorkerOperationContext } from "./context";
import { logWorkerIdle, logWorkerStartup } from "./logging";
import { getWorkerRuntimeConfig } from "./runtime";

const APP_ENVIRONMENTS = ["local", "test", "staging", "production"] as const;
const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

function getBootstrapEnvironment(env: NodeJS.ProcessEnv): string {
  const candidate = env.APP_ENV;

  if (
    typeof candidate === "string" &&
    (APP_ENVIRONMENTS as readonly string[]).includes(candidate)
  ) {
    return candidate;
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

function createBootstrapLogger(env: NodeJS.ProcessEnv) {
  const environment = getBootstrapEnvironment(env);
  const bootstrapContext = createObservabilityContext({
    service: "vision-worker",
    environment
  });

  return createLogger({
    service: "vision-worker",
    environment,
    level: getBootstrapLogLevel(env),
    context: bootstrapContext
  });
}

const bootstrapLogger = createBootstrapLogger(process.env);

try {
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
} catch (error: unknown) {
  bootstrapLogger.error("worker.start_failed", {
    error
  });
  process.exit(1);
}
