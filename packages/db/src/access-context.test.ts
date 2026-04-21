import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { closeDatabasePool, createDatabaseClient, createDatabasePool } from "./client";
import { getDatabaseRuntimeConfig } from "./config";
import { withDatabaseAccessContext } from "./index";

const { databaseUrl } = getDatabaseRuntimeConfig(process.env);

describe("withDatabaseAccessContext", () => {
  it("applies tenant and branch settings inside the transaction", async () => {
    const pool = createDatabasePool(databaseUrl);
    const db = createDatabaseClient(pool);

    try {
      const result = await withDatabaseAccessContext(
        db,
        {
          tenantId: "tenant_1",
          branchId: "branch_1",
          subjectId: "sub_1",
          subjectType: "internal",
          sessionId: "sess_1",
        },
        async (tx) => {
          const tenantRows = await tx.execute(
            sql`select current_setting('vision.tenant_id', true) as tenant_id`,
          );
          const branchRows = await tx.execute(
            sql`select current_setting('vision.branch_id', true) as branch_id`,
          );

          return {
            tenantId: tenantRows.rows[0]?.tenant_id,
            branchId: branchRows.rows[0]?.branch_id,
          };
        },
      );

      expect(result).toEqual({
        tenantId: "tenant_1",
        branchId: "branch_1",
      });
    } finally {
      await closeDatabasePool(pool);
    }
  });

  it("fails closed when tenant context is missing", async () => {
    const pool = createDatabasePool(databaseUrl);
    const db = createDatabaseClient(pool);

    try {
      await expect(
        withDatabaseAccessContext(
          db,
          {
            tenantId: "" as unknown as string,
            branchId: null,
            subjectId: "sub_1",
            subjectType: "internal",
            sessionId: "sess_1",
          },
          async () => null,
        ),
      ).rejects.toMatchObject({
        code: "tenant_db_context_required",
      });
    } finally {
      await closeDatabasePool(pool);
    }
  });
});
