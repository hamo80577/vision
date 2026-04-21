import { describe, expect, it } from "vitest";

import {
  createObservabilityId,
  isSafeObservabilityId,
  sanitizeObservabilityId
} from "./ids";

describe("ids", () => {
  it("sanitizeObservabilityId keeps safe values", () => {
    expect(sanitizeObservabilityId("req-123:abc")).toBe("req-123:abc");
  });

  it("rejects malformed or oversized values", () => {
    expect(sanitizeObservabilityId("has spaces")).toBeUndefined();
    expect(sanitizeObservabilityId("bad\r\nid")).toBeUndefined();
    expect(sanitizeObservabilityId("a".repeat(129))).toBeUndefined();
  });

  it("createObservabilityId returns a safe generated id", () => {
    const value = createObservabilityId();

    expect(typeof value).toBe("string");
    expect(value.length).toBeGreaterThan(0);
    expect(value.length).toBeLessThanOrEqual(128);
    expect(isSafeObservabilityId(value)).toBe(true);
  });
});
