import { describe, expect, it } from "vitest";

import { getWorkerStatus } from "./status";

describe("getWorkerStatus", () => {
  it("includes the validated runtime environment", () => {
    expect(getWorkerStatus("local")).toEqual({
      service: "vision-worker",
      status: "idle",
      environment: "local"
    });
  });
});
