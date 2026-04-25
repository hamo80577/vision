import type { AuthAssuranceLevel } from "@vision/authn";

export type InternalPlatformRole = "platform_admin";

export type InternalTenantRole = "tenant_owner" | "branch_manager" | "receptionist" | "cashier";

export type AuthorizationActorClaims =
  | {
      actorType: "internal";
      subjectId: string;
      currentAssurance: AuthAssuranceLevel;
      platformRole?: InternalPlatformRole;
      tenantRole?: InternalTenantRole;
      assignedBranchIds?: string[];
    }
  | {
      actorType: "customer";
      subjectId: string;
      currentAssurance: AuthAssuranceLevel;
    };

export type AuthorizationResource =
  | { family: "platform_tenant_management" }
  | { family: "tenant_settings" }
  | { family: "branch_operations" }
  | { family: "website" }
  | { family: "customer_account" };

export type AuthorizationAction =
  | "read"
  | "list"
  | "create"
  | "update"
  | "delete"
  | "change_status"
  | "switch_context"
  | "export";

export type AuthorizationContextFacts = {
  activeTenantId?: string;
  activeBranchId?: string;
  targetTenantId?: string;
  targetBranchId?: string;
  resourceOwnerSubjectId?: string;
  platformProvisioningOperation?:
    | "create_tenant"
    | "list_tenants"
    | "read_tenant"
    | "update_subscription"
    | "update_entitlements"
    | "activate_tenant"
    | "suspend_tenant"
    | "issue_onboarding_link";
};

export type AuthorizationDeniedCode =
  | "unsupported_actor"
  | "unsupported_resource"
  | "unsupported_action"
  | "missing_context"
  | "insufficient_scope"
  | "insufficient_assurance"
  | "self_access_only"
  | "explicit_deny";

export type AuthorizationDecisionDebug = {
  policyFamily?: string;
  missingFacts?: string[];
  expectedTenantId?: string;
  expectedBranchId?: string;
};

export type AuthorizationDecision =
  | { allowed: true }
  | {
      allowed: false;
      code: AuthorizationDeniedCode;
      requiredAssurance?: AuthAssuranceLevel;
      debug?: AuthorizationDecisionDebug;
    };

export type AuthorizationInput = {
  actor: AuthorizationActorClaims;
  resource: AuthorizationResource;
  action: AuthorizationAction;
  context: AuthorizationContextFacts;
};
