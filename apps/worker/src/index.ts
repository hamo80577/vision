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
