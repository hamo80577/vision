import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

const SESSION_SECRET_BYTES = 32;

export type ParsedSessionToken = {
  sessionId: string;
  secret: string;
};

export type CreatedSessionToken = ParsedSessionToken & {
  token: string;
  secretHash: string;
};

export function hashSessionSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function verifySessionSecret(expectedHash: string, secret: string): boolean {
  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(hashSessionSecret(secret), "hex");

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function parseSessionToken(token: string): ParsedSessionToken {
  const [sessionId, secret, ...rest] = token.split(".");

  if (!sessionId || !secret || rest.length > 0) {
    throw new Error("Invalid session token.");
  }

  return {
    sessionId,
    secret,
  };
}

export function createSessionToken(): CreatedSessionToken {
  const sessionId = `sess_${randomUUID()}`;
  const secret = randomBytes(SESSION_SECRET_BYTES).toString("base64url");

  return {
    sessionId,
    secret,
    token: `${sessionId}.${secret}`,
    secretHash: hashSessionSecret(secret),
  };
}
