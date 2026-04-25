import { describe, expect, it } from "vitest";

import { authorize } from "./index";
import type { AuthorizationActorClaims, AuthorizationInput } from "./types";

const baseInternalActor: AuthorizationActorClaims = {
  actorType: "internal",
  subjectId: "sub_internal",
  currentAssurance: "mfa_verified",
};

const baseCustomerActor: AuthorizationActorClaims = {
  actorType: "customer",
  subjectId: "sub_customer",
  currentAssurance: "basic",
};

function runAuthorization(
  input: Partial<AuthorizationInput> & Pick<AuthorizationInput, "resource" | "action">,
) {
  return authorize({
    actor: baseInternalActor,
    context: {},
    ...input,
  });
}

describe("authorize", () => {
  it("denies unsupported resource families by default", () => {
    const decision = authorize({
      actor: baseInternalActor,
      action: "read",
      resource: { family: "unknown_family" } as unknown as AuthorizationInput["resource"],
      context: {},
    });

    expect(decision).toMatchObject({
      allowed: false,
      code: "unsupported_resource",
    });
  });

  it("returns missing_context when tenant facts are absent", () => {
    const decision = runAuthorization({
      resource: { family: "tenant_settings" },
      action: "read",
      actor: {
        ...baseInternalActor,
        tenantRole: "tenant_owner",
      },
      context: {},
    });

    expect(decision).toMatchObject({
      allowed: false,
      code: "missing_context",
    });
  });

  it("returns insufficient_scope when tenant role claims are missing", () => {
    const decision = runAuthorization({
      resource: { family: "tenant_settings" },
      action: "read",
      context: {
        activeTenantId: "tenant_a",
        targetTenantId: "tenant_a",
      },
    });

    expect(decision).toMatchObject({
      allowed: false,
      code: "insufficient_scope",
    });
  });

  it("returns insufficient_scope when tenant facts do not match", () => {
    const decision = runAuthorization({
      resource: { family: "tenant_settings" },
      action: "read",
      actor: {
        ...baseInternalActor,
        tenantRole: "tenant_owner",
      },
      context: {
        activeTenantId: "tenant_a",
        targetTenantId: "tenant_b",
      },
    });

    expect(decision).toMatchObject({
      allowed: false,
      code: "insufficient_scope",
    });
  });

  it("returns missing_context when branch facts are absent", () => {
    const decision = runAuthorization({
      resource: { family: "branch_operations" },
      action: "read",
      actor: {
        ...baseInternalActor,
        tenantRole: "branch_manager",
        assignedBranchIds: ["branch_1"],
      },
      context: {
        activeTenantId: "tenant_1",
        targetTenantId: "tenant_1",
      },
    });

    expect(decision).toMatchObject({
      allowed: false,
      code: "missing_context",
    });
  });

  it("returns insufficient_scope when assigned branch claims are missing", () => {
    const decision = runAuthorization({
      resource: { family: "branch_operations" },
      action: "update",
      actor: {
        ...baseInternalActor,
        tenantRole: "branch_manager",
      },
      context: {
        activeTenantId: "tenant_1",
        activeBranchId: "branch_1",
        targetTenantId: "tenant_1",
        targetBranchId: "branch_1",
      },
    });

    expect(decision).toMatchObject({
      allowed: false,
      code: "insufficient_scope",
    });
  });

  it("returns insufficient_scope for tenant owners without assigned branch scope", () => {
    const decision = runAuthorization({
      resource: { family: "branch_operations" },
      action: "read",
      actor: {
        ...baseInternalActor,
        tenantRole: "tenant_owner",
      },
      context: {
        activeTenantId: "tenant_1",
        activeBranchId: "branch_1",
        targetTenantId: "tenant_1",
        targetBranchId: "branch_1",
      },
    });

    expect(decision).toMatchObject({
      allowed: false,
      code: "insufficient_scope",
    });
  });

  it("returns insufficient_scope when the target branch is outside assigned scope", () => {
    const decision = runAuthorization({
      resource: { family: "branch_operations" },
      action: "update",
      actor: {
        ...baseInternalActor,
        tenantRole: "branch_manager",
        assignedBranchIds: ["branch_1"],
      },
      context: {
        activeTenantId: "tenant_1",
        activeBranchId: "branch_2",
        targetTenantId: "tenant_1",
        targetBranchId: "branch_2",
      },
    });

    expect(decision).toMatchObject({
      allowed: false,
      code: "insufficient_scope",
    });
  });

  it("returns insufficient_assurance for under-assured switch-context actions", () => {
    const decision = runAuthorization({
      resource: { family: "platform_tenant_management" },
      action: "switch_context",
      actor: {
        ...baseInternalActor,
        currentAssurance: "mfa_verified",
        platformRole: "platform_admin",
      },
      context: {
        targetTenantId: "tenant_1",
      },
    });

    expect(decision).toMatchObject({
      allowed: false,
      code: "insufficient_assurance",
      requiredAssurance: "step_up_verified",
    });
  });

  it("returns insufficient_assurance for under-assured website exports", () => {
    const decision = runAuthorization({
      resource: { family: "website" },
      action: "export",
      actor: {
        ...baseInternalActor,
        tenantRole: "tenant_owner",
      },
      context: {
        activeTenantId: "tenant_1",
        targetTenantId: "tenant_1",
      },
    });

    expect(decision).toMatchObject({
      allowed: false,
      code: "insufficient_assurance",
      requiredAssurance: "step_up_verified",
    });
  });

  it("allows platform admins to create tenants without a target tenant id", () => {
    const decision = runAuthorization({
      resource: { family: "platform_tenant_management" },
      action: "create",
      actor: {
        ...baseInternalActor,
        platformRole: "platform_admin",
      },
      context: {
        platformProvisioningOperation: "create_tenant",
      },
    });

    expect(decision).toEqual({ allowed: true });
  });

  it("requires an explicit provisioning operation for platform tenant management writes", () => {
    const decision = runAuthorization({
      resource: { family: "platform_tenant_management" },
      action: "update",
      actor: {
        ...baseInternalActor,
        platformRole: "platform_admin",
      },
      context: {
        targetTenantId: "tenant_1",
      },
    });

    expect(decision).toMatchObject({
      allowed: false,
      code: "missing_context",
    });
  });

  it("allows subscription updates only with the matching provisioning operation", () => {
    const decision = runAuthorization({
      resource: { family: "platform_tenant_management" },
      action: "update",
      actor: {
        ...baseInternalActor,
        platformRole: "platform_admin",
      },
      context: {
        targetTenantId: "tenant_1",
        platformProvisioningOperation: "update_subscription",
      },
    });

    expect(decision).toEqual({ allowed: true });
  });

  it("allows onboarding-link issuance with explicit target tenant scope", () => {
    const decision = runAuthorization({
      resource: { family: "platform_tenant_management" },
      action: "create",
      actor: {
        ...baseInternalActor,
        platformRole: "platform_admin",
      },
      context: {
        targetTenantId: "tenant_1",
        platformProvisioningOperation: "issue_onboarding_link",
      },
    });

    expect(decision).toEqual({ allowed: true });
  });

  it("rejects mismatched platform provisioning action and operation pairs", () => {
    const decision = runAuthorization({
      resource: { family: "platform_tenant_management" },
      action: "update",
      actor: {
        ...baseInternalActor,
        platformRole: "platform_admin",
      },
      context: {
        targetTenantId: "tenant_1",
        platformProvisioningOperation: "activate_tenant",
      },
    });

    expect(decision).toMatchObject({
      allowed: false,
      code: "unsupported_action",
    });
  });

  it("allows explicit customer self-access", () => {
    const decision = authorize({
      actor: baseCustomerActor,
      resource: { family: "customer_account" },
      action: "read",
      context: {
        resourceOwnerSubjectId: "sub_customer",
      },
    });

    expect(decision).toEqual({ allowed: true });
  });

  it("denies non-self customer access", () => {
    const decision = authorize({
      actor: baseCustomerActor,
      resource: { family: "customer_account" },
      action: "read",
      context: {
        resourceOwnerSubjectId: "someone_else",
      },
    });

    expect(decision).toMatchObject({
      allowed: false,
      code: "self_access_only",
    });
  });

  it("denies unsupported customer actions", () => {
    const decision = authorize({
      actor: baseCustomerActor,
      resource: { family: "customer_account" },
      action: "delete",
      context: {
        resourceOwnerSubjectId: "sub_customer",
      },
    });

    expect(decision).toMatchObject({
      allowed: false,
      code: "unsupported_action",
    });
  });

  it("denies internal actors for customer self-access resources", () => {
    const decision = authorize({
      actor: baseInternalActor,
      resource: { family: "customer_account" },
      action: "read",
      context: {
        resourceOwnerSubjectId: "sub_customer",
      },
    });

    expect(decision).toMatchObject({
      allowed: false,
      code: "unsupported_actor",
    });
  });
});
