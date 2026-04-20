type TransactionCapable<TTx> = {
  transaction<TResult>(callback: (tx: TTx) => Promise<TResult>): Promise<TResult>;
};

export async function withDatabaseTransaction<TTx, TResult>(
  db: TransactionCapable<TTx>,
  callback: (tx: TTx) => Promise<TResult>
): Promise<TResult> {
  return db.transaction(callback);
}
