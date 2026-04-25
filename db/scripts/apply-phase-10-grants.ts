import { Client } from "pg";

import {
  deriveAdminTargetDatabaseUrl,
  getDatabaseAdminConfig,
  getDatabaseRuntimeConfig,
  parseDatabaseRoleCredentials,
} from "../../packages/db/src";

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function qualifyTable(schema: string, table: string): string {
  return `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
}

const runtimeConfig = getDatabaseRuntimeConfig(process.env);
const adminConfig = getDatabaseAdminConfig(process.env);

if (adminConfig.appEnv !== "local" && adminConfig.appEnv !== "test") {
  throw new Error("apply-phase-10-grants is allowed only in local or test environments");
}

if (adminConfig.appEnv !== runtimeConfig.appEnv) {
  throw new Error("Runtime and admin app env must match");
}

const { roleName: runtimeRoleName } = parseDatabaseRoleCredentials(runtimeConfig.databaseUrl);

const adminTargetDatabaseUrl = deriveAdminTargetDatabaseUrl(
  adminConfig.adminDatabaseUrl,
  adminConfig.adminTargetDatabaseName,
);

const adminClient = new Client({
  connectionString: adminTargetDatabaseUrl,
});

try {
  await adminClient.connect();

  const role = quoteIdentifier(runtimeRoleName);

  await adminClient.query(
    `grant select, insert, update on table ${qualifyTable("public", "tenants")} to ${role}`,
  );
  await adminClient.query(
    `grant select, insert, update on table ${qualifyTable("public", "tenant_owners")} to ${role}`,
  );
  await adminClient.query(
    `grant select, insert, update on table ${qualifyTable("public", "tenant_subscriptions")} to ${role}`,
  );
  await adminClient.query(
    `grant select, insert, update on table ${qualifyTable("public", "tenant_entitlements")} to ${role}`,
  );
  await adminClient.query(
    `grant select, insert, delete on table ${qualifyTable("public", "tenant_enabled_modules")} to ${role}`,
  );
  await adminClient.query(
    `grant select, insert, update on table ${qualifyTable("public", "tenant_owner_onboarding_links")} to ${role}`,
  );
  await adminClient.query(
    `grant select, insert on table ${qualifyTable("public", "tenant_lifecycle_events")} to ${role}`,
  );
  await adminClient.query(
    `grant insert on table ${qualifyTable("public", "auth_subjects")} to ${role}`,
  );
} finally {
  await adminClient.end();
}
