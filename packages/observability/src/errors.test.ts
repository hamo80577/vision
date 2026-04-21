import { describe, expect, it } from "vitest";

import {
  ProblemError,
  getProblemDefinitionForStatus,
  isProblemError,
  serializeErrorForLog
} from "./errors";

describe("errors", () => {
  it("getProblemDefinitionForStatus(404) returns stable not-found definition", () => {
    expect(getProblemDefinitionForStatus(404)).toEqual({
      status: 404,
      code: "not_found",
      title: "Not Found",
      type: "https://vision.local/problems/not-found"
    });
  });

  it("ProblemError and isProblemError work as expected", () => {
    const error = new ProblemError({
      status: 409,
      code: "conflict",
      title: "Conflict",
      type: "https://vision.local/problems/conflict",
      detail: "Version mismatch"
    });

    expect(error).toBeInstanceOf(Error);
    expect(isProblemError(error)).toBe(true);
    expect(isProblemError(new Error("plain"))).toBe(false);
    expect(error.status).toBe(409);
    expect(error.code).toBe("conflict");
  });

  it("sanitizes ProblemError.problem instance and traceId", () => {
    const error = new ProblemError({
      status: 404,
      code: "not_found",
      title: "Not Found",
      type: "https://vision.local/problems/not-found",
      detail: "Missing",
      instance: "https://example.com/orders/1?token=secret",
      traceId: "trace bad\r\nid"
    });

    expect(error.problem.instance).toBe("/orders/1");
    expect(error.problem.traceId).toBeUndefined();
  });

  it("carries safe assurance metadata for insufficient assurance responses", () => {
    const error = new ProblemError({
      status: 403,
      code: "insufficient_assurance",
      title: "Insufficient Assurance",
      type: "https://vision.local/problems/insufficient-assurance",
      detail: "Step-up verification is required.",
      requiredAssurance: "step_up_verified",
      denialReason: "step_up_required"
    });

    expect(error.requiredAssurance).toBe("step_up_verified");
    expect(error.denialReason).toBe("step_up_required");
    expect(error.problem.requiredAssurance).toBe("step_up_verified");
    expect(error.problem.denialReason).toBe("step_up_required");
  });

  it("serializeErrorForLog carries safe debug metadata for authz-style errors", () => {
    const error = Object.assign(new Error("Forbidden"), {
      code: "insufficient_scope",
      requiredAssurance: "step_up_verified",
      debug: {
        policyFamily: "tenant_settings",
        missingFacts: ["targetTenantId"]
      }
    });

    expect(serializeErrorForLog(error)).toMatchObject({
      code: "insufficient_scope",
      requiredAssurance: "step_up_verified",
      debug: {
        policyFamily: "tenant_settings",
        missingFacts: ["targetTenantId"]
      }
    });
  });
});
