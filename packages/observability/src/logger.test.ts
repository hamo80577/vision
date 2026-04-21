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

    const error = new Error("boom") as Error & { statusCode?: number };
    error.stack = "raw stack trace";
    error.statusCode = 502;
    logger.error("failed", { error, foo: "bar" });

    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]) as {
      meta: { error: Record<string, unknown>; foo: string };
    };
    expect(parsed.meta.error.message).toBe("boom");
    expect(parsed.meta.error).not.toHaveProperty("stack");
    expect(parsed.meta.error.statusCode).toBe(502);
    expect(parsed.meta.foo).toBe("bar");
  });

  it("serializes nested Error metadata safely", () => {
    const lines: string[] = [];
    const logger = createLogger({
      service: "api",
      environment: "test",
      level: "debug",
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      write: (line) => lines.push(line)
    });

    const nested = new Error("nested boom") as Error & { statusCode?: number };
    nested.stack = "nested raw stack";
    nested.statusCode = 503;

    logger.error("nested failure", {
      payload: {
        phase: "sync",
        cause: nested
      }
    });

    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]) as {
      meta: { payload: { phase: string; cause: Record<string, unknown> } };
    };
    expect(parsed.meta.payload.phase).toBe("sync");
    expect(parsed.meta.payload.cause.message).toBe("nested boom");
    expect(parsed.meta.payload.cause.statusCode).toBe(503);
    expect(parsed.meta.payload.cause).not.toHaveProperty("stack");
  });

  it("handles circular metadata safely", () => {
    const lines: string[] = [];
    const logger = createLogger({
      service: "api",
      environment: "test",
      level: "debug",
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      write: (line) => lines.push(line)
    });

    const circular: Record<string, unknown> = {
      tag: "root"
    };
    circular.self = circular;

    expect(() => logger.info("circular", { circular })).not.toThrow();
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]) as {
      meta: { circular: { tag: string; self: string } };
    };
    expect(parsed.meta.circular.tag).toBe("root");
    expect(parsed.meta.circular.self).toBe("[Circular]");
  });

  it("redacts stack from error-shaped plain objects", () => {
    const lines: string[] = [];
    const logger = createLogger({
      service: "api",
      environment: "test",
      level: "debug",
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      write: (line) => lines.push(line)
    });

    logger.error("plain object error", {
      error: {
        name: "Error",
        message: "plain failure",
        code: "E_PLAIN",
        statusCode: 500,
        stack: "very secret stack"
      }
    });

    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]) as {
      meta: { error: Record<string, unknown> };
    };
    expect(parsed.meta.error.name).toBe("Error");
    expect(parsed.meta.error.message).toBe("plain failure");
    expect(parsed.meta.error.code).toBe("E_PLAIN");
    expect(parsed.meta.error.statusCode).toBe(500);
    expect(parsed.meta.error).not.toHaveProperty("stack");
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
