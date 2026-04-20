import { describe, expect, it, vi } from "vitest";

import { withDatabaseTransaction } from "./transactions";

describe("withDatabaseTransaction", () => {
  it("delegates to the database transaction API", async () => {
    const transaction = vi.fn(async (callback: (tx: string) => Promise<string>) =>
      callback("tx-marker")
    );

    await expect(
      withDatabaseTransaction(
        {
          transaction
        },
        async (tx) => `${tx}:complete`
      )
    ).resolves.toBe("tx-marker:complete");

    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
