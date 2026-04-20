import { sql } from "drizzle-orm";

type DatabaseHealthExecutor = {
  execute: (query: ReturnType<typeof sql>) => Promise<{
    rows: Array<{ ok: number }>;
  }>;
};

export async function checkDatabaseHealth(
  db: DatabaseHealthExecutor,
): Promise<{ status: "ok"; ok: true }> {
  const result = await db.execute(sql`select 1 as ok`);

  if (result.rows[0]?.ok !== 1) {
    throw new Error("Database health check did not return ok=1");
  }

  return {
    status: "ok",
    ok: true,
  };
}
