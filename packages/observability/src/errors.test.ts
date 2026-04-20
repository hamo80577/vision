import { describe, expect, it } from "vitest";

import {
  ProblemError,
  getProblemDefinitionForStatus,
  isProblemError
} from "./errors";

describe("errors", () => {
  it("getProblemDefinitionForStatus(404) returns stable not-found definition", () => {
    expect(getProblemDefinitionForStatus(404)).toEqual({
      status: 404,
      code: "not_found",
      title: "Not Found",
      type: "urn:vision:problem:not_found"
    });
  });

  it("ProblemError and isProblemError work as expected", () => {
    const error = new ProblemError({
      status: 409,
      code: "conflict",
      title: "Conflict",
      type: "urn:vision:problem:conflict",
      detail: "Version mismatch"
    });

    expect(error).toBeInstanceOf(Error);
    expect(isProblemError(error)).toBe(true);
    expect(isProblemError(new Error("plain"))).toBe(false);
    expect(error.problem.status).toBe(409);
    expect(error.problem.code).toBe("conflict");
  });
});
