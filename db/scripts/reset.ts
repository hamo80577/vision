import { execFileSync } from "node:child_process";

import { Client } from "pg";

import {
  deriveAdminTargetDatabaseUrl,
  getDatabaseAdminConfig,
  getDatabaseRuntimeConfig,
  parseDatabaseRoleCredentials,
} from "../../packages/db/src";

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

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function revokeDatabaseAccess(
  adminClient: Client,
  databaseName: string,
  runtimeRoleIdentifier: string,
): Promise<void> {
  const databaseIdentifier = quoteIdentifier(databaseName);

  await adminClient.query(
    `revoke all privileges on database ${databaseIdentifier} from public`,
  );
  await adminClient.query(
    `revoke all privileges on database ${databaseIdentifier} from ${runtimeRoleIdentifier}`,
  );
}

function runPnpmCommand(
  args: string[],
  options: { env?: NodeJS.ProcessEnv } = {},
): void {
  const command = process.platform === "win32" ? "corepack.cmd" : "corepack";

  execFileSync(command, ["pnpm", ...args], {
    shell: process.platform === "win32",
    env: options.env ?? process.env,
    stdio: "inherit",
  });
}

const runtimeConfig = getDatabaseRuntimeConfig(process.env);
const adminConfig = getDatabaseAdminConfig(process.env);

if (adminConfig.appEnv !== "local" && adminConfig.appEnv !== "test") {
  throw new Error("db:reset is allowed only in local or test environments");
}

if (adminConfig.appEnv !== runtimeConfig.appEnv) {
  throw new Error("Runtime and admin app env must match");
}

const targetDatabaseName = adminConfig.adminTargetDatabaseName;
const maintenanceDatabaseName = getDatabaseName(adminConfig.adminDatabaseUrl);
const adminTargetDatabaseUrl = deriveAdminTargetDatabaseUrl(
  adminConfig.adminDatabaseUrl,
  targetDatabaseName,
);

if (getDatabaseName(adminTargetDatabaseUrl) !== getDatabaseName(runtimeConfig.databaseUrl)) {
  throw new Error("DATABASE_ADMIN_TARGET_DB must match DATABASE_URL");
}

if (maintenanceDatabaseName === targetDatabaseName) {
  throw new Error(
    "DATABASE_ADMIN_URL must point to a maintenance database, not the target application database",
  );
}

const adminClient = new Client({
  connectionString: adminConfig.adminDatabaseUrl,
});

try {
  await adminClient.connect();

  const { roleName: runtimeRoleName, rolePassword: runtimeRolePassword } =
    parseDatabaseRoleCredentials(runtimeConfig.databaseUrl);
  const adminRoleName = decodeURIComponent(new URL(adminConfig.adminDatabaseUrl).username);
  const runtimeRoleIdentifier = quoteIdentifier(runtimeRoleName);

  if (runtimeRoleName === adminRoleName) {
    throw new Error("DATABASE_URL and DATABASE_ADMIN_URL must use different database roles");
  }

  const runtimeRoleExists = await adminClient.query(
    "select 1 from pg_roles where rolname = $1",
    [runtimeRoleName],
  );
  const runtimeRoleStatement = runtimeRoleExists.rowCount > 0 ? "alter role" : "create role";

  await adminClient.query(
    `${runtimeRoleStatement} ${runtimeRoleIdentifier} with login password ${quoteLiteral(runtimeRolePassword)} noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls`,
  );

  const inheritedRoleMemberships = await adminClient.query<{ roleName: string }>(
    `select parent.rolname as "roleName"
     from pg_auth_members memberships
     join pg_roles parent on parent.oid = memberships.roleid
     join pg_roles member on member.oid = memberships.member
     where member.rolname = $1`,
    [runtimeRoleName],
  );

  for (const membership of inheritedRoleMemberships.rows) {
    await adminClient.query(
      `revoke ${quoteIdentifier(membership.roleName)} from ${runtimeRoleIdentifier}`,
    );
  }

  const connectableDatabases = await adminClient.query<{ databaseName: string }>(
    `select datname as "databaseName"
     from pg_database
     where datallowconn = true`,
  );

  for (const database of connectableDatabases.rows) {
    await revokeDatabaseAccess(
      adminClient,
      database.databaseName,
      runtimeRoleIdentifier,
    );
  }

  await adminClient.query(
    `select pg_terminate_backend(pid)
     from pg_stat_activity
     where datname = $1
       and pid <> pg_backend_pid()`,
    [targetDatabaseName],
  );
  await adminClient.query(`drop database if exists ${quoteIdentifier(targetDatabaseName)}`);
  await adminClient.query(`create database ${quoteIdentifier(targetDatabaseName)}`);
  await revokeDatabaseAccess(adminClient, targetDatabaseName, runtimeRoleIdentifier);
  await adminClient.query(
    `grant connect on database ${quoteIdentifier(targetDatabaseName)} to ${runtimeRoleIdentifier}`,
  );
} finally {
  await adminClient.end();
}

runPnpmCommand(["db:migrate"]);
runPnpmCommand(["exec", "tsx", "db/scripts/apply-phase-9-grants.ts"]);
const seedEnv: NodeJS.ProcessEnv = {
  ...process.env,
  DATABASE_URL: adminTargetDatabaseUrl,
};

delete seedEnv.DATABASE_ADMIN_URL;
delete seedEnv.DATABASE_ADMIN_TARGET_DB;

runPnpmCommand(["db:seed"], {
  // Seeding is a bootstrap operation that needs full access. Keep runtime grants narrow.
  env: seedEnv,
});
