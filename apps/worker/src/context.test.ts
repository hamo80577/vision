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
