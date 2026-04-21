import { describe, expect, it, vi } from "vitest";

import { checkDatabaseHealth } from "./health";

describe("checkDatabaseHealth", () => {
  it("returns ok when the database responds to select 1", async () => {
    const execute = vi.fn().mockResolvedValue({
      rows: [{ ok: 1 }],
    });

    await expect(
      checkDatabaseHealth({
        execute,
      } as never),
    ).resolves.toEqual({
      status: "ok",
      ok: true,
    });

    expect(execute).toHaveBeenCalledTimes(1);
  });
});
