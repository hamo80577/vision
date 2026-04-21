import * as OTPAuth from "otpauth";
import { describe, expect, it } from "vitest";

import {
  createChallengeToken,
  createTotpProvisioning,
  decryptTotpSecret,
  encryptTotpSecret,
  generateBackupCodes,
  generateTotpSecret,
  parseChallengeToken,
  verifyBackupCodeHash,
  verifyChallengeSecret,
  verifyTotpCode,
} from "./mfa";

const MFA_ENCRYPTION_KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

describe("mfa helpers", () => {
  it("creates challenge tokens whose secrets verify against the stored hash", () => {
    const created = createChallengeToken();
    const parsed = parseChallengeToken(created.token);

    expect(parsed).toEqual({
      challengeId: created.challengeId,
      secret: created.secret,
    });
    expect(verifyChallengeSecret(created.secretHash, created.secret)).toBe(true);
    expect(verifyChallengeSecret(created.secretHash, "wrong-secret")).toBe(false);
  });

  it("encrypts and decrypts a TOTP secret without storing plaintext", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const encrypted = encryptTotpSecret(secret, MFA_ENCRYPTION_KEY);

    expect(encrypted).not.toContain(secret);
    expect(decryptTotpSecret(encrypted, MFA_ENCRYPTION_KEY)).toBe(secret);
  });

  it("generates hashed backup codes that only verify the original value", () => {
    const [first] = generateBackupCodes(1);

    expect(first.plainText).toMatch(/^[A-Z0-9]{5}-[A-Z0-9]{5}$/);
    expect(first.hash).not.toBe(first.plainText);
    expect(verifyBackupCodeHash(first.hash, first.plainText)).toBe(true);
    expect(verifyBackupCodeHash(first.hash, "WRONG-CODE1")).toBe(false);
  });

  it("builds a TOTP provisioning payload that can verify a live code", () => {
    const manualEntryKey = generateTotpSecret();
    const provisioning = createTotpProvisioning({
      issuer: "Vision",
      accountName: "ops@vision.test",
      manualEntryKey,
    });
    const now = new Date("2026-04-21T12:00:00.000Z");
    const totp = new OTPAuth.TOTP({
      issuer: "Vision",
      label: "ops@vision.test",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(manualEntryKey),
    });
    const code = totp.generate({ timestamp: now.getTime() });

    expect(provisioning.otpauthUrl.startsWith("otpauth://totp/")).toBe(true);
    expect(verifyTotpCode(manualEntryKey, code, now)).toBe(true);
  });
});
