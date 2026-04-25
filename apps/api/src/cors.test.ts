import { describe, expect, it } from "vitest";

import { buildApi } from "./server";

describe("api CORS", () => {
  const runtime = {
    appEnv: "test",
    host: "127.0.0.1",
    port: 4000,
    databaseUrl:
      "postgresql://vision_local:vision_local_password@localhost:5432/vision_local",
    mfaEncryptionKey: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
    mfaEncryptionKeyVersion: "v1",
    logLevel: "debug",
    serviceName: "vision-api",
  } as const;

  it("allows credentialed frontend requests from the local platform origin", async () => {
    const api = buildApi({
      runtime,
    });

    const response = await api.inject({
      method: "OPTIONS",
      url: "/auth/internal/login",
      headers: {
        origin: "http://localhost:3002",
        "access-control-request-method": "POST",
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:3002");
    expect(response.headers["access-control-allow-credentials"]).toBe("true");

    await api.close();
  });
});
