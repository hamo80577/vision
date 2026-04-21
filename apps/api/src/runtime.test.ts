import { ConfigError } from "@vision/config";
import { describe, expect, it } from "vitest";

import { getApiListenOptions, getApiRuntimeConfig } from "./runtime";

const validApiEnv = {
  APP_ENV: "local",
  API_HOST: "127.0.0.1",
  API_PORT: "4000",
  DATABASE_URL:
    "postgresql://vision_local:vision_local_password@localhost:5432/vision_local",
  LOG_LEVEL: "debug"
};

describe("runtime", () => {
  it("getApiRuntimeConfig(validApiEnv) returns runtime settings", () => {
    expect(getApiRuntimeConfig(validApiEnv)).toEqual({
      appEnv: "local",
      host: "127.0.0.1",
      port: 4000,
      databaseUrl:
        "postgresql://vision_local:vision_local_password@localhost:5432/vision_local",
      logLevel: "debug",
      serviceName: "vision-api"
    });
  });

  it("maps validated API config to Fastify listen options", () => {
    expect(getApiListenOptions(validApiEnv)).toEqual({
      host: "127.0.0.1",
      port: 4000
    });
  });

  it("fails before startup when API config is invalid", () => {
    const { DATABASE_URL: _databaseUrl, ...missingDatabaseUrlEnv } =
      validApiEnv;

    expect(() => getApiListenOptions(missingDatabaseUrlEnv)).toThrow(
      ConfigError
    );
  });
});
