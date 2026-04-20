import { describe, expect, it } from "vitest";

import { createLogger } from "./logger";

describe("logger", () => {
  it("writes structured JSON with inherited context", () => {
    const lines: string[] = [];
    const logger = createLogger({
      service: "worker",
      environment: "test",
      level: "debug",
      context: { requestId: "req-1", correlationId: "corr-1" },
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      write: (line) => lines.push(line)
    });

    const child = logger.child({ tenant: "t-1" });
    child.info("job started", { branch: "main" });

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual({
      timestamp: "2026-01-01T00:00:00.000Z",
      level: "info",
      service: "worker",
      environment: "test",
      message: "job started",
      context: {
        requestId: "req-1",
        correlationId: "corr-1",
        tenant: "t-1"
      },
      meta: {
        branch: "main"
      }
    });
  });

  it("serializes Error objects safely without raw stack dumps", () => {
    const lines: string[] = [];
    const logger = createLogger({
      service: "api",
      environment: "test",
      level: "debug",
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      write: (line) => lines.push(line)
    });

    const error = new Error("boom");
    error.stack = "raw stack trace";
    logger.error("failed", { error, foo: "bar" });

    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]) as {
      meta: { error: Record<string, unknown>; foo: string };
    };
    expect(parsed.meta.error.message).toBe("boom");
    expect(parsed.meta.error).not.toHaveProperty("stack");
    expect(parsed.meta.foo).toBe("bar");
  });

  it("filters out messages below configured level", () => {
    const lines: string[] = [];
    const logger = createLogger({
      service: "api",
      environment: "test",
      level: "warn",
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      write: (line) => lines.push(line)
    });

    logger.info("ignore me");
    logger.warn("keep me");

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).message).toBe("keep me");
  });
});
