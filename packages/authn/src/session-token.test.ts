import { describe, expect, it } from "vitest";

import {
  createSessionToken,
  hashSessionSecret,
  parseSessionToken,
  verifySessionSecret,
} from "./session-token";

describe("session token helpers", () => {
  it("creates a token whose secret verifies against the stored hash", () => {
    const created = createSessionToken();
    const parsed = parseSessionToken(created.token);

    expect(parsed).toEqual({
      sessionId: created.sessionId,
      secret: created.secret,
    });
    expect(verifySessionSecret(created.secretHash, created.secret)).toBe(true);
    expect(created.secretHash).toBe(hashSessionSecret(created.secret));
  });

  it("rejects malformed tokens and wrong secrets", () => {
    expect(() => parseSessionToken("bad-token")).toThrow("Invalid session token.");

    const created = createSessionToken();
    expect(verifySessionSecret(created.secretHash, "wrong-secret")).toBe(false);
  });
});
