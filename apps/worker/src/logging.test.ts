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
