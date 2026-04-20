import { describe, expect, it } from "vitest";

import { withDatabaseTransaction } from "./transactions";

describe("withDatabaseTransaction", () => {
  it("delegates to the database transaction API", async () => {
    let calls = 0;
    const transaction = async <TResult>(
      callback: (tx: string) => Promise<TResult>,
    ): Promise<TResult> => {
      calls += 1;
      return callback("tx-marker");
    };

    await expect(
      withDatabaseTransaction(
        {
          transaction,
        },
        async (tx) => `${tx}:complete`,
      ),
    ).resolves.toBe("tx-marker:complete");

    expect(calls).toBe(1);
  });
});
