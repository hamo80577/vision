import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./password";

describe("password helpers", () => {
  it("hashes passwords with argon2id and verifies the original password", async () => {
    const passwordHash = await hashPassword("S3cure-password!");

    expect(passwordHash).not.toBe("S3cure-password!");
    expect(passwordHash.startsWith("$argon2id$")).toBe(true);
    await expect(verifyPassword(passwordHash, "S3cure-password!")).resolves.toBe(
      true,
    );
  });

  it("rejects the wrong password", async () => {
    const passwordHash = await hashPassword("S3cure-password!");

    await expect(verifyPassword(passwordHash, "wrong-password")).resolves.toBe(
      false,
    );
  });
});
