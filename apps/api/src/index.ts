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
