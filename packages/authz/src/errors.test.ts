import { describe, expect, it } from "vitest";

import {
  AuthzError,
  isAuthzError,
  requireAuthorization,
  type AuthorizationDecision
} from "./index";

describe("authz errors", () => {
  it("throws AuthzError with code, assurance, and debug metadata from denied decisions", () => {
    const denied: AuthorizationDecision = {
      allowed: false,
      code: "insufficient_assurance",
      requiredAssurance: "step_up_verified",
      debug: {
        policyFamily: "website",
        missingFacts: ["targetTenantId"]
      }
    };

    expect(() => requireAuthorization(denied)).toThrow(AuthzError);

    try {
      requireAuthorization(denied);
    } catch (error) {
      expect(isAuthzError(error)).toBe(true);
      expect(error).toMatchObject({
        code: "insufficient_assurance",
        requiredAssurance: "step_up_verified",
        debug: {
          policyFamily: "website",
          missingFacts: ["targetTenantId"]
        }
      });
    }
  });

  it("accepts allowed decisions without throwing", () => {
    expect(() => requireAuthorization({ allowed: true })).not.toThrow();
  });
});
