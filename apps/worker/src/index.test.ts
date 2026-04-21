import { afterEach, describe, expect, it, vi } from "vitest";

const originalAppEnv = process.env.APP_ENV;
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalLogLevel = process.env.LOG_LEVEL;

afterEach(() => {
  vi.restoreAllMocks();
  process.env.APP_ENV = originalAppEnv;
  process.env.DATABASE_URL = originalDatabaseUrl;
  process.env.LOG_LEVEL = originalLogLevel;
});

describe("worker entrypoint", () => {
  it("logs a sanitized startup failure when runtime config cannot be created", async () => {
    vi.resetModules();
    process.env.APP_ENV = "test";
    delete process.env.DATABASE_URL;
    delete process.env.LOG_LEVEL;

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((code?: number) => code as never) as typeof process.exit);

    await import("./index");

    expect(exitSpy).toHaveBeenCalledWith(1);

    const [line] = logSpy.mock.calls.at(-1) ?? [];
    expect(line).toEqual(expect.any(String));

    const entry = JSON.parse(line as string) as {
      level: string;
      message: string;
      context?: { requestId?: string; correlationId?: string; service?: string; environment?: string };
      meta?: { error?: { name?: string; message?: string; stack?: string } };
    };

    expect(entry).toMatchObject({
      level: "error",
      message: "worker.start_failed",
      context: {
        service: "vision-worker",
        environment: "test"
      }
    });
    expect(entry.context?.requestId).toEqual(expect.any(String));
    expect(entry.context?.correlationId).toEqual(expect.any(String));
    expect(entry.meta?.error).toMatchObject({
      name: "ConfigError"
    });
    expect(entry.meta?.error).not.toHaveProperty("stack");
  });
});
