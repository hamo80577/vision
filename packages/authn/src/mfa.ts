import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import * as OTPAuth from "otpauth";

const AES_ALGORITHM = "aes-256-gcm";
const AES_IV_BYTES = 12;
const CHALLENGE_SECRET_BYTES = 32;

export type ParsedChallengeToken = {
  challengeId: string;
  secret: string;
};

export type CreatedChallengeToken = ParsedChallengeToken & {
  token: string;
  secretHash: string;
};

export type GeneratedBackupCode = {
  plainText: string;
  hash: string;
};

function decodeEncryptionKey(value: string): Buffer {
  const key = Buffer.from(value, "base64");

  if (key.length !== 32) {
    throw new Error("Invalid MFA encryption key.");
  }

  return key;
}

function normalizeBackupCode(code: string): string {
  return code.replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

export function hashOpaqueSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function verifyChallengeSecret(expectedHash: string, secret: string): boolean {
  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(hashOpaqueSecret(secret), "hex");

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createChallengeToken(): CreatedChallengeToken {
  const challengeId = `chl_${randomUUID()}`;
  const secret = randomBytes(CHALLENGE_SECRET_BYTES).toString("base64url");

  return {
    challengeId,
    secret,
    token: `${challengeId}.${secret}`,
    secretHash: hashOpaqueSecret(secret),
  };
}

export function parseChallengeToken(token: string): ParsedChallengeToken {
  const [challengeId, secret, ...rest] = token.split(".");

  if (!challengeId || !secret || rest.length > 0) {
    throw new Error("Invalid assurance challenge token.");
  }

  return {
    challengeId,
    secret,
  };
}

export function encryptTotpSecret(secret: string, encryptionKey: string): string {
  const iv = randomBytes(AES_IV_BYTES);
  const cipher = createCipheriv(AES_ALGORITHM, decodeEncryptionKey(encryptionKey), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
}

export function decryptTotpSecret(payload: string, encryptionKey: string): string {
  const [iv, ciphertext, tag] = payload.split(".");

  if (!iv || !ciphertext || !tag) {
    throw new Error("Invalid encrypted TOTP payload.");
  }

  const decipher = createDecipheriv(
    AES_ALGORITHM,
    decodeEncryptionKey(encryptionKey),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function generateTotpSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

export function createTotpProvisioning(input: {
  issuer: string;
  accountName: string;
  manualEntryKey: string;
}) {
  const totp = new OTPAuth.TOTP({
    issuer: input.issuer,
    label: input.accountName,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(input.manualEntryKey),
  });

  return {
    manualEntryKey: input.manualEntryKey,
    otpauthUrl: totp.toString(),
  };
}

export function verifyTotpCode(
  manualEntryKey: string,
  code: string,
  now: Date,
): boolean {
  const totp = new OTPAuth.TOTP({
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(manualEntryKey),
  });

  return totp.validate({ token: code, timestamp: now.getTime(), window: 1 }) !== null;
}

export function generateBackupCodes(count = 8): GeneratedBackupCode[] {
  return Array.from({ length: count }, () => {
    const normalized = randomBytes(5).toString("hex").toUpperCase();
    const plainText = `${normalized.slice(0, 5)}-${normalized.slice(5)}`;

    return {
      plainText,
      hash: hashOpaqueSecret(normalizeBackupCode(plainText)),
    };
  });
}

export function verifyBackupCodeHash(expectedHash: string, code: string): boolean {
  return verifyChallengeSecret(expectedHash, normalizeBackupCode(code));
}
