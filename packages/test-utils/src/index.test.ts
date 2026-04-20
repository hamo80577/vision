import { describe, expect, it } from "vitest";

import { createTestLabel } from "./index";

describe("createTestLabel", () => {
  it("creates deterministic labels for workspace tests", () => {
    expect(createTestLabel("workspace")).toBe("vision:test:workspace");
  });
});
