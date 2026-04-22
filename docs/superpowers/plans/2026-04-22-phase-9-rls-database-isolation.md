# Phase 9 RLS and Database Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a dedicated tenant-scoped RLS proof table, harden the runtime database role before any passing RLS proof is attempted, enforce PostgreSQL row-level security from trusted Phase 8 DB context, and prove same-tenant success plus cross-tenant and missing-context denial with runtime-role integration tests.

**Architecture:** Keep Phase 8 tenancy resolution and DB access-context propagation unchanged as the trusted input boundary. Separate runtime and admin database concerns concretely: migrations and bootstrap work run through the admin path, the runtime role is restricted and non-owning, and RLS policies consume only `vision.tenant_id` through a PostgreSQL helper. Existing DB-backed tests that currently use the runtime connection for fixture setup must move to the admin path so runtime grants stay least-privilege.

**Tech Stack:** TypeScript, Vitest, Drizzle ORM, PostgreSQL 17, SQL migrations, existing `@vision/config`, `@vision/db`, `@vision/tenancy`, and the current auth/API test suites

---

## File Structure

### Create

- `packages/db/src/role-hardening.ts`
- `packages/db/src/role-hardening.test.ts`
- `packages/db/src/schema/tenant-rls-probes.ts`
- `packages/db/src/rls.test.ts`
- `db/scripts/apply-phase-9-grants.ts`
- `docs/security/row-level-security.md`
- `docs/adr/0006-runtime-role-hardening-and-rls-proof-surface.md`
- `db/migrations/0004_phase_9_rls_isolation.sql`
- `db/migrations/meta/0004_snapshot.json`

### Modify

- `.env.example`
- `compose.yaml`
- `.github/workflows/ci.yml`
- `drizzle.config.ts`
- `packages/config/src/index.ts`
- `packages/config/src/index.test.ts`
- `packages/db/src/config.test.ts`
- `packages/db/src/index.ts`
- `packages/db/src/schema/index.ts`
- `db/scripts/reset.ts`
- `packages/authn/src/service.integration.test.ts`
- `apps/api/src/auth-routes.test.ts`
- `apps/api/src/authz-guard.test.ts`
- `apps/api/src/tenancy-guard.test.ts`
- `docs/project/local-development.md`
- `docs/security/README.md`
- `docs/security/database-role-strategy.md`
- `docs/security/tenancy-execution-context.md`
- `db/migrations/meta/_journal.json`

### Responsibilities

- `packages/db/src/role-hardening.ts`: derive the admin-target migration URL from admin config and parse runtime-role credentials from the runtime URL only.
- `db/scripts/reset.ts`: create or alter the restricted runtime role before recreating the app database, then run migrations and the explicit runtime-grants script.
- `db/scripts/apply-phase-9-grants.ts`: apply least-privilege runtime grants after migrations using the runtime role derived from `DATABASE_URL`.
- `packages/authn/src/service.integration.test.ts`, `apps/api/src/*.test.ts`: move fixture setup and fixture assertions that do not represent runtime behavior onto the admin-target DB path so runtime grants stay narrow.
- `packages/db/src/schema/tenant-rls-probes.ts`: define the narrow Phase 9 tenant-scoped proof table.
- `db/migrations/0004_phase_9_rls_isolation.sql`: create the proof table, add the `vision.require_tenant_id()` helper, enable and force RLS, and add read/write policies.
- `packages/db/src/rls.test.ts`: prove same-tenant allow, cross-tenant read deny, cross-tenant update/delete deny, missing-context deny, and no runtime-role bypass path.
- docs files: explain the runtime/admin split, least-privilege grants, admin bootstrap assumptions, and the RLS proof surface.

## Explicit Admin Bootstrap Assumption

Phase 9 uses two distinct DB paths:

- **Runtime path**: the restricted role referenced by `DATABASE_URL`. All security proofs must run through this connection.
- **Admin/bootstrap path**: the privileged role referenced by `DATABASE_ADMIN_URL`, pointed at the target application database when migrations, grants, or test fixtures require it.

The plan explicitly treats the admin path as a bootstrap and maintenance path. It may bypass RLS in local/test environments during migration and fixture setup. That is acceptable only for:

- schema creation and alteration
- grant application
- test fixture setup and cleanup
- migration/bootstrap verification

It is **not** acceptable for security assertions. Every allow/deny proof in Phase 9 must be executed through the runtime connection.

## Least-Privilege Runtime Grant Target

Phase 9 grants must match the current runtime path, not the full schema inventory.

The live runtime code currently needs:

- `auth_subjects`: `SELECT`
- `auth_sessions`: `SELECT`, `INSERT`, `UPDATE`
- `auth_assurance_challenges`: `SELECT`, `INSERT`, `UPDATE`
- `auth_mfa_totp_factors`: `SELECT`, `INSERT`, `UPDATE`
- `auth_mfa_backup_codes`: `SELECT`, `INSERT`, `UPDATE`
- `auth_account_events`: `INSERT`
- `tenant_rls_probes`: `SELECT`, `INSERT`, `UPDATE`, `DELETE`
- `vision.require_tenant_id()`: `EXECUTE`
- `public` and `vision` schemas: `USAGE`

Phase 9 must **not** grant runtime access to:

- `app_metadata`
- auth-table `DELETE`
- auth-table DDL or ownership privileges
- blanket schema `CREATE`
- broad grants added only to support test fixtures

Test fixtures that currently rely on those extra writes must move to the admin path instead of widening runtime grants.

### Task 1: Add the Runtime/Admin Role Contract Helpers

**Files:**
- Create: `packages/db/src/role-hardening.ts`
- Create: `packages/db/src/role-hardening.test.ts`
- Modify: `packages/db/src/index.ts`
- Modify: `packages/config/src/index.ts`
- Modify: `packages/config/src/index.test.ts`
- Modify: `packages/db/src/config.test.ts`
- Modify: `drizzle.config.ts`

- [ ] **Step 1: Write the failing helper tests**

Create `packages/db/src/role-hardening.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  deriveAdminTargetDatabaseUrl,
  parseDatabaseRoleCredentials,
} from "./role-hardening";

describe("role hardening helpers", () => {
  it("derives the admin target URL from the maintenance URL", () => {
    expect(
      deriveAdminTargetDatabaseUrl(
        "postgresql://vision_admin:vision_admin_password@localhost:5433/postgres",
        "vision_local",
      ),
    ).toBe(
      "postgresql://vision_admin:vision_admin_password@localhost:5433/vision_local",
    );
  });

  it("parses the runtime role from DATABASE_URL", () => {
    expect(
      parseDatabaseRoleCredentials(
        "postgresql://vision_runtime:vision_runtime_password@localhost:5433/vision_local",
      ),
    ).toEqual({
      roleName: "vision_runtime",
      rolePassword: "vision_runtime_password",
    });
  });
});
```

Update the local defaults in `packages/config/src/index.test.ts`:

```ts
const localDatabaseUrl =
  "postgresql://vision_runtime:vision_runtime_password@localhost:5433/vision_local";
const localAdminDatabaseUrl =
  "postgresql://vision_admin:vision_admin_password@localhost:5433/postgres";
```

Update `packages/db/src/config.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the failing tests**

Run:

```powershell
pnpm --filter @vision/config test -- src/index.test.ts
pnpm --filter @vision/db test -- src/config.test.ts src/role-hardening.test.ts
```

Expected: FAIL because the helper file and updated local credential contract do not exist yet.

- [ ] **Step 3: Implement the helpers and the corrected local credential contract**

Create `packages/db/src/role-hardening.ts`:

```ts
export function deriveAdminTargetDatabaseUrl(
  adminDatabaseUrl: string,
  targetDatabaseName: string,
): string {
  const url = new URL(adminDatabaseUrl);
  url.pathname = `/${targetDatabaseName}`;

  return url.toString();
}

export function parseDatabaseRoleCredentials(databaseUrl: string): {
  roleName: string;
  rolePassword: string;
} {
  const url = new URL(databaseUrl);
  const roleName = decodeURIComponent(url.username);
  const rolePassword = decodeURIComponent(url.password);

  if (!roleName || !rolePassword) {
    throw new Error("DATABASE_URL must include a runtime role username and password");
  }

  return {
    roleName,
    rolePassword,
  };
}
```

Update `packages/config/src/index.ts` so local defaults become:

```ts
const localDatabaseUrl =
  "postgresql://vision_runtime:vision_runtime_password@localhost:5433/vision_local";
const localDatabaseAdminUrl =
  "postgresql://vision_admin:vision_admin_password@localhost:5433/postgres";
const localDatabaseUsers = ["vision_runtime", "vision_admin"];
const localDatabasePasswords = [
  "vision_runtime_password",
  "vision_admin_password",
];
```

Update the unsafe-default detection to use those arrays instead of the old `vision_local` user/password constants.

Update `packages/db/src/index.ts`:

```ts
export {
  deriveAdminTargetDatabaseUrl,
  parseDatabaseRoleCredentials,
} from "./role-hardening";
```

Update `drizzle.config.ts` so migrations use admin credentials pointed at the target application DB:

```ts
import {
  deriveAdminTargetDatabaseUrl,
  getDatabaseAdminConfig,
} from "./packages/db/src/index";

const { adminDatabaseUrl, adminTargetDatabaseName } = getDatabaseAdminConfig(
  process.env,
);

const migrationDatabaseUrl = deriveAdminTargetDatabaseUrl(
  adminDatabaseUrl,
  adminTargetDatabaseName,
);
```

- [ ] **Step 4: Rerun the tests**

Run:

```powershell
pnpm --filter @vision/config test -- src/index.test.ts
pnpm --filter @vision/db test -- src/config.test.ts src/role-hardening.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add packages/db/src/role-hardening.ts packages/db/src/role-hardening.test.ts packages/db/src/index.ts packages/config/src/index.ts packages/config/src/index.test.ts packages/db/src/config.test.ts drizzle.config.ts
git commit -m "feat: add runtime and admin database role helpers"
```

### Task 2: Harden Reset/Bootstrap First and Move Test Fixtures Off the Runtime Path

**Files:**
- Modify: `db/scripts/reset.ts`
- Modify: `.env.example`
- Modify: `compose.yaml`
- Modify: `.github/workflows/ci.yml`
- Modify: `packages/authn/src/service.integration.test.ts`
- Modify: `apps/api/src/auth-routes.test.ts`
- Modify: `apps/api/src/authz-guard.test.ts`
- Modify: `apps/api/src/tenancy-guard.test.ts`

- [ ] **Step 1: Write the failing fixture-path expectations**

Before editing the files, record the current mismatch:

- the reset flow still uses the old single-role local setup
- DB-backed auth/API tests seed and clean fixtures through the same runtime client they are about to restrict

Add a small runtime-role assertion to one representative DB-backed test file, for example `packages/authn/src/service.integration.test.ts`, that proves fixture setup must not rely on runtime `INSERT` into `auth_subjects` after hardening:

```ts
expect(new URL(getDatabaseRuntimeConfig(process.env).databaseUrl).username).toBe(
  "vision_runtime",
);
```

- [ ] **Step 2: Run the representative tests to verify the old assumptions are still in place**

Run:

```powershell
pnpm --filter @vision/authn test -- src/service.integration.test.ts
pnpm --filter @vision/api test -- src/auth-routes.test.ts src/authz-guard.test.ts src/tenancy-guard.test.ts
```

Expected: PASS today, but only because the runtime/admin split is not yet enforced. This is the baseline being replaced.

- [ ] **Step 3: Harden the reset/bootstrap flow before any RLS proof passes**

Update `db/scripts/reset.ts`:

```ts
import {
  deriveAdminTargetDatabaseUrl,
  getDatabaseAdminConfig,
  parseDatabaseRoleCredentials,
} from "../../packages/db/src/index";
```

Add:

```ts
function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
```

Derive the runtime role from the runtime URL:

```ts
const config = getDatabaseAdminConfig(process.env);
const runtimeRole = parseDatabaseRoleCredentials(config.databaseUrl);
const adminTargetUrl = deriveAdminTargetDatabaseUrl(
  config.adminDatabaseUrl,
  config.adminTargetDatabaseName,
);
```

Before dropping and recreating the app DB, create or alter the runtime role:

```ts
await adminClient.query(`
do $$
begin
  if not exists (
    select 1 from pg_roles where rolname = ${quoteLiteral(runtimeRole.roleName)}
  ) then
    execute 'create role ${quoteIdentifier(runtimeRole.roleName)} login password ${quoteLiteral(runtimeRole.rolePassword)} nosuperuser nocreatedb nocreaterole noreplication nobypassrls';
  else
    execute 'alter role ${quoteIdentifier(runtimeRole.roleName)} with login password ${quoteLiteral(runtimeRole.rolePassword)} nosuperuser nocreatedb nocreaterole noreplication nobypassrls';
  end if;
end
$$;
`);
```

After recreating the app DB:

```ts
await adminClient.query(`
  grant connect on database ${quoteIdentifier(targetDatabaseName)}
  to ${quoteIdentifier(runtimeRole.roleName)}
`);
```

After `pnpm db:migrate`, run grants before seeds:

```ts
runPnpmCommand(["db:migrate"]);
runPnpmCommand(["exec", "tsx", "db/scripts/apply-phase-9-grants.ts"]);
runPnpmCommand(["db:seed"]);
```

Update `.env.example`:

```text
DATABASE_URL=postgresql://vision_runtime:vision_runtime_password@localhost:5433/vision_local
DATABASE_ADMIN_URL=postgresql://vision_admin:vision_admin_password@localhost:5433/postgres
POSTGRES_USER=vision_admin
POSTGRES_PASSWORD=vision_admin_password
```

Update `compose.yaml` and `.github/workflows/ci.yml` to use the `vision_admin` cluster/bootstrap role for PostgreSQL startup and the `vision_runtime` role for `DATABASE_URL`.

- [ ] **Step 4: Move DB-backed fixture setup and fixture assertions onto the admin path**

In each of these files:

- `packages/authn/src/service.integration.test.ts`
- `apps/api/src/auth-routes.test.ts`
- `apps/api/src/authz-guard.test.ts`
- `apps/api/src/tenancy-guard.test.ts`

create both:

- `runtimeDb` from `getDatabaseRuntimeConfig(...)`
- `adminDb` from `deriveAdminTargetDatabaseUrl(getDatabaseAdminConfig(...).adminDatabaseUrl, getDatabaseAdminConfig(...).adminTargetDatabaseName)`

Then move fixture-only operations to `adminDb`, including:

- inserting `auth_subjects`
- direct session row patching for setup
- cleanup deletes from `auth_account_events`, `auth_sessions`, and `auth_subjects`
- direct event-table assertions that are not part of runtime route execution

Keep runtime request execution on `runtimeDb` only.

- [ ] **Step 5: Reset the database and rerun the representative test suites**

Run:

```powershell
pnpm db:reset
pnpm --filter @vision/authn test -- src/service.integration.test.ts
pnpm --filter @vision/api test -- src/auth-routes.test.ts src/authz-guard.test.ts src/tenancy-guard.test.ts
```

Expected: PASS with the hardened runtime role in place and test fixtures no longer relying on widened runtime grants.

- [ ] **Step 6: Commit**

```powershell
git add db/scripts/reset.ts .env.example compose.yaml .github/workflows/ci.yml packages/authn/src/service.integration.test.ts apps/api/src/auth-routes.test.ts apps/api/src/authz-guard.test.ts apps/api/src/tenancy-guard.test.ts
git commit -m "feat: harden runtime bootstrap and move fixtures to admin path"
```

### Task 3: Add the Failing Phase 9 RLS Proof Tests

**Files:**
- Create: `packages/db/src/rls.test.ts`

- [ ] **Step 1: Write the failing RLS proof tests**

Create `packages/db/src/rls.test.ts` with these invariants:

1. admin/bootstrap fixture setup is explicit and isolated
2. runtime same-tenant read succeeds
3. runtime same-tenant write succeeds
4. runtime cross-tenant read returns nothing
5. runtime cross-tenant insert is rejected
6. runtime cross-tenant update of an existing foreign row is rejected
7. runtime cross-tenant delete of an existing foreign row is rejected
8. runtime access without DB context is rejected
9. runtime role is not superuser, does not have `BYPASSRLS`, does not own the protected table, and cannot disable RLS

Use the admin-target connection for fixture setup and cleanup only. Make that assumption explicit in the test file header comment:

```ts
/**
 * Phase 9 fixture setup uses the admin/bootstrap DB path intentionally.
 * All security assertions run through the restricted runtime connection.
 */
```

Seed two rows for two tenants through the admin path:

```ts
await adminDb.execute(sql`
  insert into tenant_rls_probes (id, tenant_id, probe_key, probe_value)
  values
    (${rowA}, ${tenantA}, 'alpha', 'tenant-a'),
    (${rowB}, ${tenantB}, 'beta', 'tenant-b')
`);
```

Add explicit foreign-row write denials:

```ts
await expect(
  tx.execute(sql`
    update tenant_rls_probes
    set probe_value = 'should-fail'
    where id = ${rowB}
  `),
).rejects.toThrow();

await expect(
  tx.execute(sql`
    delete from tenant_rls_probes
    where id = ${rowB}
  `),
).rejects.toThrow();
```

Add the runtime-role privilege proof:

```ts
const roleRows = await adminDb.execute<{
  rolsuper: boolean;
  rolbypassrls: boolean;
}>(sql`
  select rolsuper, rolbypassrls
  from pg_roles
  where rolname = ${runtimeRole}
`);

expect(roleRows.rows[0]).toEqual({
  rolsuper: false,
  rolbypassrls: false,
});
```

- [ ] **Step 2: Run the failing RLS tests**

Run:

```powershell
pnpm --filter @vision/db test -- src/rls.test.ts
```

Expected: FAIL because the proof table, helper, runtime grants, and policies do not exist yet.

- [ ] **Step 3: Commit**

```powershell
git add packages/db/src/rls.test.ts
git commit -m "test: add failing phase 9 rls proof suite"
```

### Task 4: Implement the Proof Table, Runtime Grants, and Enforced RLS

**Files:**
- Create: `packages/db/src/schema/tenant-rls-probes.ts`
- Create: `db/scripts/apply-phase-9-grants.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/src/index.ts`
- Create: `db/migrations/0004_phase_9_rls_isolation.sql`
- Create: `db/migrations/meta/0004_snapshot.json`
- Modify: `db/migrations/meta/_journal.json`

- [ ] **Step 1: Add the proof-table schema**

Create `packages/db/src/schema/tenant-rls-probes.ts`:

```ts
import { index, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

export const tenantRlsProbes = pgTable(
  "tenant_rls_probes",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 64 }).notNull(),
    probeKey: varchar("probe_key", { length: 128 }).notNull(),
    probeValue: text("probe_value").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index("tenant_rls_probes_tenant_idx").on(table.tenantId),
    tenantKeyIdx: uniqueIndex("tenant_rls_probes_tenant_key_key").on(
      table.tenantId,
      table.probeKey,
    ),
  }),
);
```

Update schema exports in `packages/db/src/schema/index.ts` and `packages/db/src/index.ts`.

- [ ] **Step 2: Generate the migration**

Run:

```powershell
pnpm db:generate --name phase_9_rls_isolation
```

Expected: Drizzle creates `db/migrations/0004_phase_9_rls_isolation.sql` and `db/migrations/meta/0004_snapshot.json`.

- [ ] **Step 3: Append the helper and the RLS policy SQL**

Append this SQL to `db/migrations/0004_phase_9_rls_isolation.sql`:

```sql
create schema if not exists vision;

create or replace function vision.require_tenant_id()
returns varchar(64)
language plpgsql
stable
as $$
declare
  value text;
begin
  value := nullif(btrim(current_setting('vision.tenant_id', true)), '');

  if value is null or char_length(value) > 64 then
    raise exception 'vision.tenant_id is required'
      using errcode = '42501';
  end if;

  return value::varchar(64);
end;
$$;

revoke all on function vision.require_tenant_id() from public;

alter table public.tenant_rls_probes enable row level security;
alter table public.tenant_rls_probes force row level security;

create policy tenant_rls_probes_select on public.tenant_rls_probes
for select
using (tenant_id = vision.require_tenant_id());

create policy tenant_rls_probes_insert on public.tenant_rls_probes
for insert
with check (tenant_id = vision.require_tenant_id());

create policy tenant_rls_probes_update on public.tenant_rls_probes
for update
using (tenant_id = vision.require_tenant_id())
with check (tenant_id = vision.require_tenant_id());

create policy tenant_rls_probes_delete on public.tenant_rls_probes
for delete
using (tenant_id = vision.require_tenant_id());
```

- [ ] **Step 4: Create the concrete least-privilege grants script**

Create `db/scripts/apply-phase-9-grants.ts`:

```ts
import { Client } from "pg";

import {
  deriveAdminTargetDatabaseUrl,
  getDatabaseAdminConfig,
  getDatabaseRuntimeConfig,
  parseDatabaseRoleCredentials,
} from "../../packages/db/src/index";

const admin = getDatabaseAdminConfig(process.env);
const runtime = getDatabaseRuntimeConfig(process.env);
const runtimeRole = parseDatabaseRoleCredentials(runtime.databaseUrl);
const adminTargetUrl = deriveAdminTargetDatabaseUrl(
  admin.adminDatabaseUrl,
  admin.adminTargetDatabaseName,
);

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

const client = new Client({
  connectionString: adminTargetUrl,
});

try {
  await client.connect();
  await client.query(`
    grant usage on schema public to ${quoteIdentifier(runtimeRole.roleName)};
    grant usage on schema vision to ${quoteIdentifier(runtimeRole.roleName)};
    grant execute on function vision.require_tenant_id() to ${quoteIdentifier(runtimeRole.roleName)};
    grant select on table public.auth_subjects to ${quoteIdentifier(runtimeRole.roleName)};
    grant select, insert, update on table public.auth_sessions to ${quoteIdentifier(runtimeRole.roleName)};
    grant select, insert, update on table public.auth_assurance_challenges to ${quoteIdentifier(runtimeRole.roleName)};
    grant select, insert, update on table public.auth_mfa_totp_factors to ${quoteIdentifier(runtimeRole.roleName)};
    grant select, insert, update on table public.auth_mfa_backup_codes to ${quoteIdentifier(runtimeRole.roleName)};
    grant insert on table public.auth_account_events to ${quoteIdentifier(runtimeRole.roleName)};
    grant select, insert, update, delete on table public.tenant_rls_probes to ${quoteIdentifier(runtimeRole.roleName)};
  `);
} finally {
  await client.end();
}
```

- [ ] **Step 5: Reset the database and run the Phase 9 RLS suite**

Run:

```powershell
pnpm db:reset
pnpm --filter @vision/db test -- src/role-hardening.test.ts src/rls.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add packages/db/src/schema/tenant-rls-probes.ts packages/db/src/schema/index.ts packages/db/src/index.ts db/scripts/apply-phase-9-grants.ts db/migrations/0004_phase_9_rls_isolation.sql db/migrations/meta/0004_snapshot.json db/migrations/meta/_journal.json
git commit -m "feat: add phase 9 rls proof surface and policies"
```

### Task 5: Document the Phase 9 Boundary and Bootstrap Semantics

**Files:**
- Create: `docs/security/row-level-security.md`
- Create: `docs/adr/0006-runtime-role-hardening-and-rls-proof-surface.md`
- Modify: `docs/security/README.md`
- Modify: `docs/security/database-role-strategy.md`
- Modify: `docs/security/tenancy-execution-context.md`
- Modify: `docs/project/local-development.md`

- [ ] **Step 1: Write the documentation updates**

Create `docs/security/row-level-security.md` and document:

- protected table: `tenant_rls_probes`
- trusted policy input: `vision.tenant_id`
- hard rules: runtime role is not superuser, does not have `BYPASSRLS`, does not own the protected table, and `FORCE ROW LEVEL SECURITY` stays enabled
- bootstrap semantics: the admin path is for migrations and fixtures only; runtime allow/deny proofs must run through the restricted runtime role

Create `docs/adr/0006-runtime-role-hardening-and-rls-proof-surface.md` and record:

- runtime/admin credential split becomes operational in Phase 9
- runtime grants are table-by-table and least-privilege
- `tenant_rls_probes` is the dedicated proof surface
- test/bootstrap admin behavior is explicit and not the security proof path

Update:

- `docs/security/README.md`
- `docs/security/database-role-strategy.md`
- `docs/security/tenancy-execution-context.md`
- `docs/project/local-development.md`

so they reflect the new role split, the least-privilege grant contract, and the bootstrap semantics.

- [ ] **Step 2: Check the docs for placeholders**

Run:

```powershell
Select-String -Path docs/security/row-level-security.md,docs/adr/0006-runtime-role-hardening-and-rls-proof-surface.md -Pattern 'TODO|TBD|later'
```

Expected: no output.

- [ ] **Step 3: Commit**

```powershell
git add docs/security/row-level-security.md docs/adr/0006-runtime-role-hardening-and-rls-proof-surface.md docs/security/README.md docs/security/database-role-strategy.md docs/security/tenancy-execution-context.md docs/project/local-development.md
git commit -m "docs: add phase 9 rls isolation guidance"
```

## Self-Review

### Review-item coverage

- runtime-role parsing bug: fixed by deriving the runtime role from `getDatabaseRuntimeConfig(...).databaseUrl` only
- task ordering: runtime-role/reset hardening now lands before the first passing RLS proof
- cross-tenant foreign-row write proof: explicit `UPDATE` and `DELETE` denial tests are required
- admin bootstrap assumption: explicit and documented
- least-privilege grants: narrowed to current runtime behavior instead of schema-wide writes

### Placeholder scan

- no `TBD`
- no `TODO`
- no vague “grant whatever the app needs”
- no hidden widening of runtime grants for fixture convenience

### Contract consistency

- `tenant_rls_probes` is still the only Phase 9 proof table
- `vision.require_tenant_id()` is the only Phase 9 policy helper consumed by RLS
- `DATABASE_URL` remains the runtime path
- `DATABASE_ADMIN_URL` remains the admin/bootstrap path

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-22-phase-9-rls-database-isolation.md`.

Execution mode selected by the user: **Subagent-Driven**.

Per user instruction, implementation must stop after each task for review.
