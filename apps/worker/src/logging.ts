import type { ObservabilityContext, VisionLogger } from "@vision/observability";

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
