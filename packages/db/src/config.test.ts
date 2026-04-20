import { describe, expect, it } from "vitest";

import {
  getDatabaseAdminConfig,
  getDatabaseRuntimeConfig
} from "./config";

describe("@vision/db config helpers", () => {
  it("reads runtime database config from validated env", () => {
    expect(
      getDatabaseRuntimeConfig({
        APP_ENV: "local",
        DATABASE_URL:
          "postgresql://vision_local:vision_local_password@localhost:5432/vision_local"
      })
    ).toEqual({
      appEnv: "local",
      databaseUrl:
        "postgresql://vision_local:vision_local_password@localhost:5432/vision_local"
    });
  });

  it("reads admin database config from validated env", () => {
    expect(
      getDatabaseAdminConfig({
        APP_ENV: "local",
        DATABASE_URL:
          "postgresql://vision_local:vision_local_password@localhost:5432/vision_local",
        DATABASE_ADMIN_URL:
          "postgresql://vision_local:vision_local_password@localhost:5432/postgres"
      })
    ).toEqual({
      appEnv: "local",
      databaseUrl:
        "postgresql://vision_local:vision_local_password@localhost:5432/vision_local",
      adminDatabaseUrl:
        "postgresql://vision_local:vision_local_password@localhost:5432/postgres"
    });
  });
});
