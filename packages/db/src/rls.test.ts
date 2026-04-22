import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import {
  closeDatabasePool,
  createDatabaseClient,
  createDatabasePool,
  deriveAdminTargetDatabaseUrl,
  getDatabaseAdminConfig,
  getDatabaseRuntimeConfig,
  withDatabaseAccessContext,
} from "./index";

const runtimeConfig = getDatabaseRuntimeConfig(process.env);
const adminConfig = getDatabaseAdminConfig(process.env);

const runtimePool = createDatabasePool(runtimeConfig.databaseUrl);
const runtimeDb = createDatabaseClient(runtimePool);

const adminTargetDatabaseUrl = deriveAdminTargetDatabaseUrl(
  adminConfig.adminDatabaseUrl,
  adminConfig.adminTargetDatabaseName,
);
const adminPool = createDatabasePool(adminTargetDatabaseUrl);
const adminDb = createDatabaseClient(adminPool);

describe("Phase 9 RLS proof surface", () => {
  afterAll(async () => {
    await closeDatabasePool(runtimePool);
    await closeDatabasePool(adminPool);
  });

  it("allows same-tenant reads", async () => {
    const tenantA = `tenant_${randomUUID()}`;
    const tenantB = `tenant_${randomUUID()}`;
    const rowA = `probe_${randomUUID()}`;
    const rowB = `probe_${randomUUID()}`;

    await adminDb.execute(sql`
      insert into tenant_rls_probes (id, tenant_id, probe_key, probe_value)
      values
        (${rowA}, ${tenantA}, 'alpha', 'tenant-a'),
        (${rowB}, ${tenantB}, 'beta', 'tenant-b')
    `);

    const result = await withDatabaseAccessContext(
      runtimeDb,
      {
        tenantId: tenantA,
        branchId: null,
        subjectId: "sub_phase_9_rls",
        subjectType: "internal",
        sessionId: "sess_phase_9_rls",
      },
      (tx) =>
        tx.execute(sql`
          select id, tenant_id
          from tenant_rls_probes
          where id in (${rowA}, ${rowB})
          order by id
        `),
    );

    expect(result.rows).toEqual([{ id: rowA, tenant_id: tenantA }]);
  });

  it("allows same-tenant writes", async () => {
    const tenantId = `tenant_${randomUUID()}`;
    const rowId = `probe_${randomUUID()}`;

    const inserted = await withDatabaseAccessContext(
      runtimeDb,
      {
        tenantId,
        branchId: null,
        subjectId: "sub_phase_9_rls",
        subjectType: "internal",
        sessionId: "sess_phase_9_rls",
      },
      async (tx) =>
        tx.execute(sql`
          insert into tenant_rls_probes (id, tenant_id, probe_key, probe_value)
          values (${rowId}, ${tenantId}, 'write-alpha', 'tenant-a')
          returning id, tenant_id, probe_value
        `),
    );

    expect(inserted.rows).toEqual([
      {
        id: rowId,
        tenant_id: tenantId,
        probe_value: "tenant-a",
      },
    ]);

    const updated = await withDatabaseAccessContext(
      runtimeDb,
      {
        tenantId,
        branchId: null,
        subjectId: "sub_phase_9_rls",
        subjectType: "internal",
        sessionId: "sess_phase_9_rls",
      },
      async (tx) =>
        tx.execute(sql`
          update tenant_rls_probes
          set probe_value = 'tenant-a-updated'
          where id = ${rowId}
            and tenant_id = ${tenantId}
          returning id, tenant_id, probe_value
        `),
    );

    expect(updated.rows).toEqual([
      {
        id: rowId,
        tenant_id: tenantId,
        probe_value: "tenant-a-updated",
      },
    ]);
  });

  it("denies cross-tenant reads", async () => {
    const tenantA = `tenant_${randomUUID()}`;
    const tenantB = `tenant_${randomUUID()}`;
    const rowA = `probe_${randomUUID()}`;
    const rowB = `probe_${randomUUID()}`;

    await adminDb.execute(sql`
      insert into tenant_rls_probes (id, tenant_id, probe_key, probe_value)
      values
        (${rowA}, ${tenantA}, 'read-alpha', 'tenant-a'),
        (${rowB}, ${tenantB}, 'read-beta', 'tenant-b')
    `);

    const result = await withDatabaseAccessContext(
      runtimeDb,
      {
        tenantId: tenantA,
        branchId: null,
        subjectId: "sub_phase_9_rls",
        subjectType: "internal",
        sessionId: "sess_phase_9_rls",
      },
      (tx) =>
        tx.execute(sql`
          select id, tenant_id
          from tenant_rls_probes
          where id in (${rowA}, ${rowB})
          order by id
        `),
    );

    expect(result.rows).toEqual([{ id: rowA, tenant_id: tenantA }]);
  });

  it("denies cross-tenant writes including foreign-row update and delete attempts", async () => {
    const tenantA = `tenant_${randomUUID()}`;
    const tenantB = `tenant_${randomUUID()}`;
    const rowB = `probe_${randomUUID()}`;
    const foreignInsertId = `probe_${randomUUID()}`;

    await adminDb.execute(sql`
      insert into tenant_rls_probes (id, tenant_id, probe_key, probe_value)
      values (${rowB}, ${tenantB}, 'write-beta', 'tenant-b')
    `);

    await expect(
      withDatabaseAccessContext(
        runtimeDb,
        {
          tenantId: tenantA,
          branchId: null,
          subjectId: "sub_phase_9_rls",
          subjectType: "internal",
          sessionId: "sess_phase_9_rls",
        },
        (tx) =>
          tx.execute(sql`
            insert into tenant_rls_probes (id, tenant_id, probe_key, probe_value)
            values (${foreignInsertId}, ${tenantB}, 'write-gamma', 'tenant-b')
          `),
      ),
    ).rejects.toMatchObject({
      cause: expect.objectContaining({
        code: "42501",
        message: expect.stringMatching(/row-level security/i),
      }),
    });

    const foreignUpdate = await withDatabaseAccessContext(
      runtimeDb,
      {
        tenantId: tenantA,
        branchId: null,
        subjectId: "sub_phase_9_rls",
        subjectType: "internal",
        sessionId: "sess_phase_9_rls",
      },
      (tx) =>
        tx.execute(sql`
          update tenant_rls_probes
          set probe_value = 'should-not-update'
          where id = ${rowB}
            and tenant_id = ${tenantB}
          returning id
        `),
    );

    expect(foreignUpdate.rows).toEqual([]);

    const foreignDelete = await withDatabaseAccessContext(
      runtimeDb,
      {
        tenantId: tenantA,
        branchId: null,
        subjectId: "sub_phase_9_rls",
        subjectType: "internal",
        sessionId: "sess_phase_9_rls",
      },
      (tx) =>
        tx.execute(sql`
          delete from tenant_rls_probes
          where id = ${rowB}
            and tenant_id = ${tenantB}
          returning id
        `),
    );

    expect(foreignDelete.rows).toEqual([]);

    const verification = await adminDb.execute(sql`
      select probe_value
      from tenant_rls_probes
      where id = ${rowB}
    `);

    expect(verification.rows).toEqual([{ probe_value: "tenant-b" }]);
  });

  it("fails closed when tenant context is missing", async () => {
    const tenantId = `tenant_${randomUUID()}`;
    const rowId = `probe_${randomUUID()}`;

    await adminDb.execute(sql`
      insert into tenant_rls_probes (id, tenant_id, probe_key, probe_value)
      values (${rowId}, ${tenantId}, 'missing-context', 'tenant-a')
    `);

    await expect(
      runtimeDb.execute(sql`
        select id
        from tenant_rls_probes
        where id = ${rowId}
      `),
    ).rejects.toMatchObject({
      cause: expect.objectContaining({
        code: "42501",
        message: "vision.tenant_id is required",
      }),
    });
  });

  it("prevents the runtime role from managing or disabling protected-table policy state", async () => {
    const policyState = await adminDb.execute<{
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
      policy_name: string;
    }>(sql`
      select
        cls.relrowsecurity,
        cls.relforcerowsecurity,
        pol.polname as policy_name
      from pg_class cls
      join pg_namespace ns
        on ns.oid = cls.relnamespace
      left join pg_policy pol
        on pol.polrelid = cls.oid
      where ns.nspname = 'public'
        and cls.relname = 'tenant_rls_probes'
      order by pol.polname
    `);

    expect(policyState.rows).toEqual([
      {
        relrowsecurity: true,
        relforcerowsecurity: true,
        policy_name: "tenant_rls_probes_delete",
      },
      {
        relrowsecurity: true,
        relforcerowsecurity: true,
        policy_name: "tenant_rls_probes_insert",
      },
      {
        relrowsecurity: true,
        relforcerowsecurity: true,
        policy_name: "tenant_rls_probes_select",
      },
      {
        relrowsecurity: true,
        relforcerowsecurity: true,
        policy_name: "tenant_rls_probes_update",
      },
    ]);

    await expect(
      runtimeDb.execute(sql`
        alter table public.tenant_rls_probes disable row level security
      `),
    ).rejects.toMatchObject({
      cause: expect.objectContaining({
        code: "42501",
        message: expect.stringMatching(/must be owner/i),
      }),
    });

    await expect(
      runtimeDb.execute(sql`
        drop policy tenant_rls_probes_select on public.tenant_rls_probes
      `),
    ).rejects.toMatchObject({
      cause: expect.objectContaining({
        code: "42501",
        message: expect.stringMatching(/must be owner/i),
      }),
    });
  });
});
