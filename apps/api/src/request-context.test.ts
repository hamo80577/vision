import { describe, expect, it } from "vitest";

import { createApiRequestContext } from "./request-context";

const runtime = {
  appEnv: "test",
  host: "127.0.0.1",
  port: 4000,
  logLevel: "debug",
  serviceName: "vision-api"
} as const;

function createRequest(
  headers: Record<string, string | undefined>
): {
  headers: Record<string, string | undefined>;
} {
  return {
    headers
  };
}

describe("createApiRequestContext", () => {
  it("invalid x-request-id is regenerated while a safe x-correlation-id is preserved", () => {
    const context = createApiRequestContext(
      createRequest({
        "x-request-id": "bad id",
        "x-correlation-id": "corr-123"
      }),
      runtime
    );

    expect(context.requestId).toEqual(expect.any(String));
    expect(context.requestId).not.toBe("bad id");
    expect(context.correlationId).toBe("corr-123");
    expect(context.service).toBe("vision-api");
    expect(context.environment).toBe("test");
  });

  it("safe x-request-id is used for both requestId and correlationId when correlation header is missing", () => {
    const context = createApiRequestContext(
      createRequest({
        "x-request-id": "req-123"
      }),
      runtime
    );

    expect(context.requestId).toBe("req-123");
    expect(context.correlationId).toBe("req-123");
    expect(context.service).toBe("vision-api");
    expect(context.environment).toBe("test");
  });
});
