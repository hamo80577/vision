import { describe, expect, it } from "vitest";

import {
  TenancyError,
  isTenancyError,
  requireResolvedTenancyContext,
  type ResolvedTenancyContext,
} from "./index";

describe("tenancy errors", () => {
  it("throws TenancyError with the machine-readable code when context is missing", () => {
    expect(() => requireResolvedTenancyContext(null)).toThrow(TenancyError);

    try {
      requireResolvedTenancyContext(null);
    } catch (error) {
      expect(isTenancyError(error)).toBe(true);
      expect(error).toMatchObject({
        code: "missing_active_tenant_context",
      });
    }
  });

  it("accepts an already resolved tenancy context", () => {
    const context: ResolvedTenancyContext = {
      surface: "erp",
      scope: "tenant",
      sessionId: "sess_1",
      subjectId: "sub_1",
      activeTenantId: "tenant_1",
      activeBranchId: null,
      targetTenantId: "tenant_1",
      targetBranchId: null,
      routeIntent: {
        surface: "erp",
        requestedScope: "tenant",
      },
      access: {
        tenantId: "tenant_1",
        allowedBranchIds: [],
      },
      branchSwitch: {
        requested: false,
        persisted: false,
        previousBranchId: null,
        nextBranchId: null,
      },
    };

    expect(requireResolvedTenancyContext(context)).toBe(context);
  });
});
