import { describe, expect, it } from "vitest";

import {
  resolveInternalTenancyContext,
  toDatabaseAccessContext,
} from "./index";

const baseSession = {
  sessionId: "sess_1",
  subjectId: "sub_1",
  subjectType: "internal" as const,
  activeTenantId: "tenant_1",
  activeBranchId: "branch_1",
};

const baseAccess = {
  tenantId: "tenant_1",
  tenantRole: "branch_manager" as const,
  allowedBranchIds: ["branch_1", "branch_2"],
};

function expectTenancyError(callback: () => unknown, code: string) {
  try {
    callback();
  } catch (error) {
    expect(error).toMatchObject({ code });
    return;
  }

  throw new Error(`Expected TenancyError with code ${code}.`);
}

describe("resolveInternalTenancyContext", () => {
  it("rejects global scope requests from internal tenancy resolution", () => {
    expectTenancyError(
      () =>
        resolveInternalTenancyContext({
          routeIntent: {
            surface: "erp",
            requestedScope: "global",
          },
          session: baseSession,
          access: baseAccess,
        }),
      "unsupported_tenancy_scope",
    );
  });

  it("rejects platform tenant execution by default", () => {
    expectTenancyError(
      () =>
        resolveInternalTenancyContext({
          routeIntent: {
            surface: "platform",
            requestedScope: "tenant",
            tenantIntent: { source: "path", rawValue: "tenant_1" },
          },
          session: baseSession,
          access: baseAccess,
        }),
      "platform_tenant_execution_disabled",
    );
  });

  it("rejects missing active tenant context", () => {
    expectTenancyError(
      () =>
        resolveInternalTenancyContext({
          routeIntent: { surface: "erp", requestedScope: "tenant" },
          session: { ...baseSession, activeTenantId: null },
          access: null,
        }),
      "missing_active_tenant_context",
    );
  });

  it("rejects branch intent mismatch outside switch flow", () => {
    expectTenancyError(
      () =>
        resolveInternalTenancyContext({
          routeIntent: {
            surface: "erp",
            requestedScope: "branch",
            branchIntent: { source: "path", rawValue: "branch_2" },
          },
          session: baseSession,
          access: baseAccess,
        }),
      "branch_intent_mismatch",
    );
  });

  it("resolves a valid branch switch without persisting it", () => {
    const result = resolveInternalTenancyContext({
      routeIntent: {
        surface: "erp",
        requestedScope: "branch_switch",
        branchIntent: { source: "payload", rawValue: "branch_2" },
      },
      session: baseSession,
      access: baseAccess,
    });

    expect(result).toMatchObject({
      scope: "branch",
      activeTenantId: "tenant_1",
      activeBranchId: "branch_1",
      targetTenantId: "tenant_1",
      targetBranchId: "branch_2",
      branchSwitch: {
        requested: true,
        persisted: false,
        previousBranchId: "branch_1",
        nextBranchId: "branch_2",
      },
    });
  });

  it("maps the resolved context into database access context", () => {
    const result = resolveInternalTenancyContext({
      routeIntent: { surface: "erp", requestedScope: "branch" },
      session: baseSession,
      access: baseAccess,
    });

    expect(toDatabaseAccessContext(result)).toEqual({
      tenantId: "tenant_1",
      branchId: "branch_1",
      subjectId: "sub_1",
      subjectType: "internal",
      sessionId: "sess_1",
    });
  });
});
