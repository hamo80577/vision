import { ConfigError } from "@vision/config";
import { describe, expect, it } from "vitest";

import { getWorkerRuntimeConfig } from "./runtime";

const validWorkerEnv = {
  APP_ENV: "test",
  DATABASE_URL:
    "postgresql://vision_test:test_password@localhost:5432/vision_test",
  LOG_LEVEL: "warn"
};

describe("getWorkerRuntimeConfig", () => {
  it("maps validated worker config to runtime settings", () => {
    expect(getWorkerRuntimeConfig(validWorkerEnv)).toEqual({
      appEnv: "test",
      databaseUrl:
        "postgresql://vision_test:test_password@localhost:5432/vision_test",
      logLevel: "warn",
      serviceName: "vision-worker"
    });
  });

  it("fails before startup when worker config is invalid", () => {
    const { DATABASE_URL: _databaseUrl, ...missingDatabaseUrlEnv } =
      validWorkerEnv;

    expect(() => getWorkerRuntimeConfig(missingDatabaseUrlEnv)).toThrow(
      ConfigError
    );
  });
});
