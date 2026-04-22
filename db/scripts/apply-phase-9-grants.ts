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
  throw new Error(
    "apply-phase-9-grants is allowed only in local or test environments",
  );
}

if (adminConfig.appEnv !== runtimeConfig.appEnv) {
  throw new Error("Runtime and admin app env must match");
}

const { roleName: runtimeRoleName } = parseDatabaseRoleCredentials(
  runtimeConfig.databaseUrl,
);

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
    `grant usage on schema ${quoteIdentifier("public")} to ${role}`,
  );
  await adminClient.query(
    `grant usage on schema ${quoteIdentifier("vision")} to ${role}`,
  );
  await adminClient.query(
    `grant execute on function ${quoteIdentifier("vision")}.${quoteIdentifier("require_tenant_id")}() to ${role}`,
  );

  await adminClient.query(
    `grant select on table ${qualifyTable("public", "auth_subjects")} to ${role}`,
  );

  await adminClient.query(
    `grant select, insert, update on table ${qualifyTable("public", "auth_sessions")} to ${role}`,
  );
  await adminClient.query(
    `grant select, insert, update on table ${qualifyTable("public", "auth_assurance_challenges")} to ${role}`,
  );
  await adminClient.query(
    `grant select, insert, update on table ${qualifyTable("public", "auth_mfa_totp_factors")} to ${role}`,
  );
  await adminClient.query(
    `grant select, insert, update on table ${qualifyTable("public", "auth_mfa_backup_codes")} to ${role}`,
  );

  await adminClient.query(
    `grant insert on table ${qualifyTable("public", "auth_account_events")} to ${role}`,
  );
  await adminClient.query(
    `grant select, insert, update, delete on table ${qualifyTable("public", "tenant_rls_probes")} to ${role}`,
  );
} finally {
  await adminClient.end();
}
