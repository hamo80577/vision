import { describe, expect, it } from "vitest";

import { createProblemDetails, sanitizeProblemInstance } from "./problem-details";

describe("problem-details", () => {
  it("sanitizeProblemInstance strips URLs and query strings down to path only", () => {
    expect(sanitizeProblemInstance("https://example.com/orders/1?token=secret")).toBe(
      "/orders/1"
    );
    expect(sanitizeProblemInstance("//example.com/orders/1?token=secret")).toBe(
      "/orders/1"
    );
    expect(sanitizeProblemInstance("///example.com/orders/1#section")).toBe(
      "/orders/1"
    );
    expect(sanitizeProblemInstance("/orders/2?debug=true")).toBe("/orders/2");
    expect(sanitizeProblemInstance(undefined)).toBe("/");
    expect(sanitizeProblemInstance("")).toBe("/");
  });

  it("createProblemDetails builds required problem payload with optional traceId", () => {
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
      code: "not_found",
      detail: "Missing record"
    });

    expect(withoutTrace.traceId).toBeUndefined();
    expect(withoutTrace.instance).toBe("/");
    expect(withoutTrace.detail).toBe("Missing record");
  });

  it("always includes a path-only instance", () => {
    const blankInstance = createProblemDetails({
      type: "https://vision.dev/problems/not-found",
      title: "Not Found",
      status: 404,
      code: "not_found",
      detail: "Missing record",
      instance: "   "
    });

    expect(blankInstance.instance).toBe("/");

    const fullUrl = createProblemDetails({
      type: "https://vision.dev/problems/not-found",
      title: "Not Found",
      status: 404,
      code: "not_found",
      detail: "Missing record",
      instance: "https://example.com/private/orders/7?token=abc"
    });

    expect(fullUrl.instance).toBe("/private/orders/7");

    const protocolRelativeUrl = createProblemDetails({
      type: "https://vision.dev/problems/not-found",
      title: "Not Found",
      status: 404,
      code: "not_found",
      detail: "Missing record",
      instance: "//example.com/private/orders/7?token=abc"
    });

    expect(protocolRelativeUrl.instance).toBe("/private/orders/7");
  });

  it("uses the validation extension shape as errors", () => {
    const validation = createProblemDetails({
      type: "https://vision.dev/problems/validation-error",
      title: "Validation Error",
      status: 422,
      code: "validation_error",
      detail: "Invalid payload",
      errors: [{ path: "email", message: "Required" }]
    });

    expect(validation.errors).toEqual([{ path: "email", message: "Required" }]);
    expect(validation).not.toHaveProperty("issues");

    const nonValidation = createProblemDetails({
      type: "https://vision.dev/problems/conflict",
      title: "Conflict",
      status: 409,
      code: "conflict",
      detail: "Version mismatch",
      errors: [{ path: "version", message: "Outdated" }]
    });

    expect(nonValidation.errors).toBeUndefined();
  });

  it("includes assurance extensions for insufficient assurance problems", () => {
    const value = createProblemDetails({
      type: "https://vision.dev/problems/insufficient-assurance",
      title: "Insufficient Assurance",
      status: 403,
      code: "insufficient_assurance",
      detail: "Step-up verification is required.",
      requiredAssurance: "step_up_verified",
      denialReason: "step_up_required"
    });

    expect(value.requiredAssurance).toBe("step_up_verified");
    expect(value.denialReason).toBe("step_up_required");
    expect(value.errors).toBeUndefined();
  });

  it("supports authz denial codes without exposing debug metadata", () => {
    const value = createProblemDetails({
      type: "https://vision.dev/problems/forbidden",
      title: "Forbidden",
      status: 403,
      code: "missing_context",
      detail: "Forbidden",
      requiredAssurance: "step_up_verified"
    });

    expect(value.code).toBe("missing_context");
    expect(value.requiredAssurance).toBe("step_up_verified");
    expect(value).not.toHaveProperty("debug");
    expect(value.denialReason).toBeUndefined();
  });

  it("supports tenancy denial codes without exposing internal metadata", () => {
    const value = createProblemDetails({
      type: "https://vision.dev/problems/forbidden",
      title: "Forbidden",
      status: 403,
      code: "tenant_intent_mismatch",
      detail: "Forbidden",
    });

    expect(value.code).toBe("tenant_intent_mismatch");
    expect(value).not.toHaveProperty("debug");
  });
});
