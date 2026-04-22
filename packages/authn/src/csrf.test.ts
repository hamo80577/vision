import { describe, expect, it } from "vitest";

import { createCsrfToken, csrfTokensMatch } from "./csrf";

describe("csrf helpers", () => {
  it("creates non-empty tokens", () => {
    expect(createCsrfToken()).toEqual(expect.any(String));
    expect(createCsrfToken()).not.toHaveLength(0);
  });

  it("compares tokens in constant time when lengths match", () => {
    const token = createCsrfToken();

    expect(csrfTokensMatch(token, token)).toBe(true);
    expect(csrfTokensMatch(token, `${token}x`)).toBe(false);
    expect(csrfTokensMatch(token, token.toUpperCase())).toBe(false);
  });
});
