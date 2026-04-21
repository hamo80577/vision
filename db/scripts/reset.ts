import { execFileSync } from "node:child_process";

import { Client } from "pg";

import { getDatabaseAdminConfig } from "../../packages/db/src/config";

function getDatabaseName(databaseUrl: string): string {
  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, "");

  if (!databaseName) {
    throw new Error("DATABASE_URL must include a database name");
  }

  return databaseName;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function runPnpmCommand(args: string[]): void {
  const command = process.platform === "win32" ? "corepack.cmd" : "corepack";

  execFileSync(command, ["pnpm", ...args], {
    shell: process.platform === "win32",
    stdio: "inherit",
  });
}

const config = getDatabaseAdminConfig(process.env);

if (config.appEnv !== "local" && config.appEnv !== "test") {
  throw new Error("db:reset is allowed only in local or test environments");
}

const targetDatabaseName = config.adminTargetDatabaseName;

if (targetDatabaseName !== getDatabaseName(config.databaseUrl)) {
  throw new Error("DATABASE_ADMIN_TARGET_DB must match DATABASE_URL");
}

if (getDatabaseName(config.adminDatabaseUrl) === targetDatabaseName) {
  throw new Error(
    "DATABASE_ADMIN_URL must point to a maintenance database, not the target application database",
  );
}

const adminClient = new Client({
  connectionString: config.adminDatabaseUrl,
});

try {
  await adminClient.connect();
  await adminClient.query(
    `select pg_terminate_backend(pid)
     from pg_stat_activity
     where datname = $1
       and pid <> pg_backend_pid()`,
    [targetDatabaseName],
  );
  await adminClient.query(`drop database if exists ${quoteIdentifier(targetDatabaseName)}`);
  await adminClient.query(`create database ${quoteIdentifier(targetDatabaseName)}`);
} finally {
  await adminClient.end();
}

runPnpmCommand(["db:migrate"]);
runPnpmCommand(["db:seed"]);
