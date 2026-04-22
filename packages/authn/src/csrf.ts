import { randomBytes, timingSafeEqual } from "node:crypto";

export function createCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

export function csrfTokensMatch(left: string, right: string): boolean {
  const normalizedLeft = left.trim();
  const normalizedRight = right.trim();

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  const leftBuffer = Buffer.from(normalizedLeft);
  const rightBuffer = Buffer.from(normalizedRight);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
