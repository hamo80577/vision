import { describe, expect, it } from "vitest";

import {
  createObservabilityContext,
  extendObservabilityContext
} from "./context";

describe("context", () => {
  it("createObservabilityContext generates missing ids and defaults correlationId to requestId", () => {
    const context = createObservabilityContext();

    expect(context.requestId).toBeTypeOf("string");
    expect(context.correlationId).toBe(context.requestId);
  });

  it("preserves safe upstream ids and optional fields", () => {
    const context = createObservabilityContext({
      requestId: "req-abc",
      correlationId: "corr-abc",
      traceId: "trace-abc",
      subject: "user:123",
      tenant: "tenant-a",
      branch: "main",
      service: "api",
      environment: "test"
    });

    expect(context).toEqual({
      requestId: "req-abc",
      correlationId: "corr-abc",
      traceId: "trace-abc",
      subject: "user:123",
      tenant: "tenant-a",
      branch: "main",
      service: "api",
      environment: "test"
    });
  });

  it("extendObservabilityContext preserves required ids and merges overrides", () => {
    const base = createObservabilityContext({
      requestId: "req-base",
      correlationId: "corr-base",
      tenant: "tenant-a",
      service: "api"
    });

    const next = extendObservabilityContext(base, {
      requestId: "req-override",
      correlationId: "corr-override",
      tenant: "tenant-b",
      environment: "prod"
    });

    expect(next.requestId).toBe("req-base");
    expect(next.correlationId).toBe("corr-base");
    expect(next.tenant).toBe("tenant-b");
    expect(next.service).toBe("api");
    expect(next.environment).toBe("prod");
  });
});
