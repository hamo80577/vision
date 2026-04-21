import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./password";

const PASSWORD_TEST_TIMEOUT_MS = 30_000;

describe("password helpers", () => {
  it(
    "hashes passwords with argon2id and verifies the original password",
    async () => {
      const passwordHash = await hashPassword("S3cure-password!");

      expect(passwordHash).not.toBe("S3cure-password!");
      expect(passwordHash.startsWith("$argon2id$")).toBe(true);
      await expect(
        verifyPassword(passwordHash, "S3cure-password!"),
      ).resolves.toBe(true);
    },
    PASSWORD_TEST_TIMEOUT_MS,
  );

  it(
    "rejects the wrong password",
    async () => {
      const passwordHash = await hashPassword("S3cure-password!");

      await expect(verifyPassword(passwordHash, "wrong-password")).resolves.toBe(
        false,
      );
    },
    PASSWORD_TEST_TIMEOUT_MS,
  );
});
