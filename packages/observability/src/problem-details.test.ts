import { describe, expect, it } from "vitest";

import { createProblemDetails, sanitizeProblemInstance } from "./problem-details";

describe("problem-details", () => {
  it("sanitizeProblemInstance strips URLs and query strings down to path only", () => {
    expect(sanitizeProblemInstance("https://example.com/orders/1?token=secret")).toBe(
      "/orders/1"
    );
    expect(sanitizeProblemInstance("/orders/2?debug=true")).toBe("/orders/2");
  });

  it("createProblemDetails builds lightweight problem payload with optional traceId", () => {
    const value = createProblemDetails({
      type: "https://vision.dev/problems/not-found",
      title: "Not Found",
      status: 404,
      code: "not_found",
      detail: "Record does not exist",
      instance: "https://example.com/orders/1?token=secret",
      traceId: "trace-123"
    });

    expect(value).toEqual({
      type: "https://vision.dev/problems/not-found",
      title: "Not Found",
      status: 404,
      code: "not_found",
      detail: "Record does not exist",
      instance: "/orders/1",
      traceId: "trace-123"
    });

    const withoutTrace = createProblemDetails({
      type: "https://vision.dev/problems/not-found",
      title: "Not Found",
      status: 404,
      code: "not_found"
    });

    expect(withoutTrace.traceId).toBeUndefined();
  });
});
