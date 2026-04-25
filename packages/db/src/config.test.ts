import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { getDatabaseAdminConfig, getDatabaseRuntimeConfig } from "./config";

const databaseEnvKeys = [
  "APP_ENV",
  "DATABASE_URL",
  "DATABASE_ADMIN_URL",
  "DATABASE_ADMIN_TARGET_DB",
] as const;

const originalCwd = process.cwd();

function snapshotDatabaseEnv(): Record<(typeof databaseEnvKeys)[number], string | undefined> {
  return Object.fromEntries(databaseEnvKeys.map((key) => [key, process.env[key]])) as Record<
    (typeof databaseEnvKeys)[number],
    string | undefined
  >;
}

function restoreDatabaseEnv(snapshot: Record<(typeof databaseEnvKeys)[number], string | undefined>): void {
  for (const key of databaseEnvKeys) {
    const value = snapshot[key];

    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe("@vision/db config helpers", () => {
  afterEach(() => {
    process.chdir(originalCwd);
  });

  it("reads runtime database config from validated env", () => {
    expect(
      getDatabaseRuntimeConfig({
        APP_ENV: "local",
        DATABASE_URL:
          "postgresql://vision_runtime:vision_runtime_password@localhost:5432/vision_local",
      }),
    ).toEqual({
      appEnv: "local",
      databaseUrl:
        "postgresql://vision_runtime:vision_runtime_password@localhost:5432/vision_local",
    });
  });

  it("reads admin database config from validated env", () => {
    expect(
      getDatabaseAdminConfig({
        APP_ENV: "local",
        DATABASE_URL:
          "postgresql://vision_runtime:vision_runtime_password@localhost:5432/vision_local",
        DATABASE_ADMIN_URL:
          "postgresql://vision_admin:vision_admin_password@localhost:5432/postgres",
        DATABASE_ADMIN_TARGET_DB: "vision_local",
      }),
    ).toEqual({
      appEnv: "local",
      databaseUrl:
        "postgresql://vision_runtime:vision_runtime_password@localhost:5432/vision_local",
      adminDatabaseUrl:
        "postgresql://vision_admin:vision_admin_password@localhost:5432/postgres",
      adminTargetDatabaseName: "vision_local",
    });
  });

  it("loads a parent .env file when reading process env", () => {
    const envSnapshot = snapshotDatabaseEnv();
    const tempRoot = mkdtempSync(join(tmpdir(), "vision-db-config-"));
    const nestedDirectory = join(tempRoot, "packages", "db");

    mkdirSync(nestedDirectory, { recursive: true });
    writeFileSync(
      join(tempRoot, ".env"),
      [
        "APP_ENV=local",
        "DATABASE_URL=postgresql://vision_runtime:vision_runtime_password@localhost:5433/vision_local",
        "DATABASE_ADMIN_URL=postgresql://vision_admin:vision_admin_password@localhost:5433/postgres",
        "DATABASE_ADMIN_TARGET_DB=vision_local",
        "",
      ].join("\n"),
    );

    for (const key of databaseEnvKeys) {
      delete process.env[key];
    }

    process.chdir(nestedDirectory);

    try {
      expect(getDatabaseRuntimeConfig()).toEqual({
        appEnv: "local",
        databaseUrl:
          "postgresql://vision_runtime:vision_runtime_password@localhost:5433/vision_local",
      });
      expect(getDatabaseAdminConfig()).toEqual({
        appEnv: "local",
        databaseUrl:
          "postgresql://vision_runtime:vision_runtime_password@localhost:5433/vision_local",
        adminDatabaseUrl:
          "postgresql://vision_admin:vision_admin_password@localhost:5433/postgres",
        adminTargetDatabaseName: "vision_local",
      });
    } finally {
      process.chdir(originalCwd);
      restoreDatabaseEnv(envSnapshot);
      rmSync(tempRoot, { force: true, recursive: true });
    }
  });
});
