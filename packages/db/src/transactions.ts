type TransactionCapable<TTx> = {
  transaction(callback: (tx: TTx) => Promise<string>): Promise<string>;
};

export async function withDatabaseTransaction<TTx, TResult>(
  db: TransactionCapable<TTx>,
  callback: (tx: TTx) => Promise<TResult>
): Promise<TResult> {
  return db.transaction(callback as never) as Promise<TResult>;
}
