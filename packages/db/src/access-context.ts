import { sql, type SQL } from "drizzle-orm";

import { TenancyError, type DatabaseAccessContext } from "@vision/tenancy";

type TransactionCapable<TTx> = {
  transaction<TResult>(callback: (tx: TTx) => Promise<TResult>): Promise<TResult>;
};

type DatabaseContextCapable = {
  execute<TResult = { rows: unknown[] }>(query: SQL): Promise<TResult>;
};

function validateDatabaseAccessContext(context: DatabaseAccessContext): void {
  if (!context.tenantId?.trim()) {
    throw new TenancyError("tenant_db_context_required");
  }
}

export async function applyDatabaseAccessContext(
  tx: DatabaseContextCapable,
  context: DatabaseAccessContext,
): Promise<void> {
  validateDatabaseAccessContext(context);

  const branchId = context.branchId ?? "";

  await tx.execute(sql`select set_config('vision.tenant_id', ${context.tenantId}, true)`);
  await tx.execute(sql`select set_config('vision.branch_id', ${branchId}, true)`);
  await tx.execute(sql`select set_config('vision.subject_id', ${context.subjectId}, true)`);
  await tx.execute(
    sql`select set_config('vision.subject_type', ${context.subjectType}, true)`,
  );
  await tx.execute(sql`select set_config('vision.session_id', ${context.sessionId}, true)`);
}

export async function withDatabaseAccessContext<TTx extends DatabaseContextCapable, TResult>(
  db: TransactionCapable<TTx>,
  context: DatabaseAccessContext,
  callback: (tx: TTx) => Promise<TResult>,
): Promise<TResult> {
  validateDatabaseAccessContext(context);

  return db.transaction(async (tx) => {
    await applyDatabaseAccessContext(tx, context);
    return callback(tx);
  });
}
