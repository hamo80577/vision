import { describe, expect, it } from "vitest";

import { ProblemError, createLogger } from "@vision/observability";

import { buildApi } from "./server";

describe("buildApi", () => {
  const runtime = {
    appEnv: "test",
    host: "127.0.0.1",
    port: 4000,
    logLevel: "debug",
    serviceName: "vision-api"
  } as const;

  it("/health?debug=true returns sanitized headers and a structured request.completed log", async () => {
    const entries: string[] = [];
    const logger = createLogger({
      service: runtime.serviceName,
      environment: runtime.appEnv,
      level: "debug",
      write: (line) => entries.push(line)
    });
    const api = buildApi({
      runtime,
      logger
    });

    const response = await api.inject({
      method: "GET",
      url: "/health?debug=true",
      headers: {
        "x-request-id": "bad id",
        "x-correlation-id": "corr-123"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      service: "vision-api",
      status: "ok"
    });
    expect(response.headers["x-request-id"]).toEqual(expect.any(String));
    expect(response.headers["x-request-id"]).not.toBe("bad id");
    expect(response.headers["x-correlation-id"]).toBe("corr-123");

    const completedLog = JSON.parse(entries.at(-1) ?? "");
    expect(completedLog).toMatchObject({
      level: "info",
      message: "request.completed",
      context: {
        requestId: response.headers["x-request-id"],
        correlationId: "corr-123"
      },
      meta: {
        method: "GET",
        route: "/health",
        statusCode: 200
      }
    });
    expect(completedLog.meta.durationMs).toEqual(expect.any(Number));

    await api.close();
  });

  it("maps ProblemError to application/problem+json with a path-only instance and stable code", async () => {
    const api = buildApi({
      runtime
    });

    api.get("/problem", async () => {
      throw new ProblemError({
        status: 409,
        code: "conflict",
        title: "Conflict",
        type: "https://vision.local/problems/conflict",
        detail: "Version mismatch",
        instance: "https://example.com/problem?token=secret"
      });
    });

    const response = await api.inject({
      method: "GET",
      url: "/problem?token=secret"
    });

    expect(response.statusCode).toBe(409);
    expect(response.headers["content-type"]).toContain("application/problem+json");
    expect(response.json()).toEqual({
      type: "https://vision.local/problems/conflict",
      title: "Conflict",
      status: 409,
      code: "conflict",
      detail: "Version mismatch",
      instance: "/problem"
    });

    await api.close();
  });

  it("maps Fastify validation errors to a lightweight validation problem with an errors array", async () => {
    const api = buildApi({
      runtime
    });

    api.post(
      "/validation",
      {
        schema: {
          body: {
            type: "object",
            required: ["name"],
            properties: {
              name: { type: "string", minLength: 1 }
            }
          }
        }
      },
      async () => ({ ok: true })
    );

    const response = await api.inject({
      method: "POST",
      url: "/validation",
      payload: {}
    });

    expect(response.statusCode).toBe(422);
    expect(response.headers["content-type"]).toContain("application/problem+json");

    const problem = response.json() as {
      code: string;
      instance: string;
      errors: Array<{ path: string; message: string; code?: string }>;
      issues?: unknown;
    };

    expect(problem.code).toBe("validation_error");
    expect(problem.instance).toBe("/validation");
    expect(problem.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "body.name",
          message: expect.any(String)
        })
      ])
    );
    expect(problem).not.toHaveProperty("issues");

    await api.close();
  });

  it("collapses unexpected errors to a safe 500 payload with no secret leak", async () => {
    const api = buildApi({
      runtime
    });

    api.get("/boom", async () => {
      throw new Error("database password leaked");
    });

    const response = await api.inject({
      method: "GET",
      url: "/boom?token=secret"
    });

    expect(response.statusCode).toBe(500);
    expect(response.headers["content-type"]).toContain("application/problem+json");
    expect(response.json()).toEqual({
      type: "https://vision.local/problems/internal-error",
      title: "Internal Server Error",
      status: 500,
      code: "internal_error",
      detail: "An unexpected error occurred.",
      instance: "/boom"
    });
    expect(response.body).not.toContain("database password leaked");
    expect(response.body).not.toContain("secret");

    await api.close();
  });
});
