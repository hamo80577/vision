import { describe, expect, it } from "vitest";

import { createNoopTracer } from "./tracing";

describe("tracing", () => {
  it("startTrace returns active trace with optional traceId and safe no-op handlers", () => {
    const tracer = createNoopTracer();
    const trace = tracer.startTrace("job.process");

    expect(trace).toHaveProperty("name", "job.process");
    expect("traceId" in trace).toBe(true);
    expect(trace.traceId).toBeUndefined();
    expect(() => trace.end({ result: "ok" })).not.toThrow();
    expect(() => trace.error(new Error("boom"))).not.toThrow();
  });
});
