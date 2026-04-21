import { describe, expect, it } from "vitest";

import {
  compareAssuranceLevels,
  resolveAssuranceFailure,
} from "./assurance";

describe("assurance helpers", () => {
  it("orders assurance levels from basic to step-up verified", () => {
    expect(compareAssuranceLevels("basic", "mfa_verified")).toBeLessThan(0);
    expect(compareAssuranceLevels("mfa_verified", "step_up_verified")).toBeLessThan(0);
    expect(compareAssuranceLevels("step_up_verified", "basic")).toBeGreaterThan(0);
    expect(compareAssuranceLevels("mfa_verified", "mfa_verified")).toBe(0);
  });

  it("returns step_up_stale when freshness is exceeded", () => {
    expect(
      resolveAssuranceFailure({
        currentAssurance: "step_up_verified",
        requiredAssurance: "step_up_verified",
        assuranceUpdatedAt: new Date("2026-04-21T10:00:00.000Z"),
        now: new Date("2026-04-21T10:06:00.000Z"),
        maxAgeMs: 5 * 60 * 1000,
      }),
    ).toBe("step_up_stale");
  });

  it("returns step_up_required when the session assurance is too low", () => {
    expect(
      resolveAssuranceFailure({
        currentAssurance: "mfa_verified",
        requiredAssurance: "step_up_verified",
        assuranceUpdatedAt: new Date("2026-04-21T10:00:00.000Z"),
        now: new Date("2026-04-21T10:00:00.000Z"),
      }),
    ).toBe("step_up_required");
  });
});
