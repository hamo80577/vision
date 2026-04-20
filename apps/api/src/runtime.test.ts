import { ConfigError } from "@vision/config";
import { describe, expect, it } from "vitest";

import { getApiListenOptions } from "./runtime";

const validApiEnv = {
  APP_ENV: "local",
  API_HOST: "127.0.0.1",
  API_PORT: "4000",
  DATABASE_URL:
    "postgresql://vision_local:vision_local_password@localhost:5432/vision_local"
};

describe("getApiListenOptions", () => {
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
