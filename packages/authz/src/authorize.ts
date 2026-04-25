import { compareAssuranceLevels, type AuthAssuranceLevel } from "@vision/authn";

import type {
  AuthorizationAction,
  AuthorizationDecision,
  AuthorizationDecisionDebug,
  AuthorizationDeniedCode,
  AuthorizationInput,
  AuthorizationResource,
  InternalTenantRole,
} from "./types";

const BRANCH_SCOPED_ROLES: InternalTenantRole[] = ["branch_manager", "receptionist", "cashier"];

function allow(): AuthorizationDecision {
  return { allowed: true };
}

function deny(
  code: AuthorizationDeniedCode,
  options: {
    requiredAssurance?: AuthAssuranceLevel;
    debug?: AuthorizationDecisionDebug;
  } = {},
): AuthorizationDecision {
  return {
    allowed: false,
    code,
    ...(options.requiredAssurance === undefined
      ? {}
      : { requiredAssurance: options.requiredAssurance }),
    ...(options.debug === undefined ? {} : { debug: options.debug }),
  };
}

function hasRequiredAssurance(
  currentAssurance: AuthAssuranceLevel,
  requiredAssurance: AuthAssuranceLevel,
) {
  return compareAssuranceLevels(currentAssurance, requiredAssurance) >= 0;
}

function findMissingFacts(
  context: AuthorizationInput["context"],
  factNames: (keyof AuthorizationInput["context"])[],
) {
  return factNames.filter((factName) => {
    const value = context[factName];
    return typeof value !== "string" || value.length === 0;
  });
}

function denyMissingContext(
  policyFamily: AuthorizationResource["family"] | string,
  context: AuthorizationInput["context"],
  factNames: (keyof AuthorizationInput["context"])[],
) {
  const missingFacts = findMissingFacts(context, factNames);

  if (missingFacts.length === 0) {
    return null;
  }

  return deny("missing_context", {
    debug: {
      policyFamily,
      missingFacts: missingFacts.map(String),
    },
  });
}

function denyUnsupportedActor(policyFamily: AuthorizationResource["family"] | string) {
  return deny("unsupported_actor", {
    debug: {
      policyFamily,
    },
  });
}

function denyUnsupportedAction(policyFamily: AuthorizationResource["family"] | string) {
  return deny("unsupported_action", {
    debug: {
      policyFamily,
    },
  });
}

function denyInsufficientScope(
  policyFamily: AuthorizationResource["family"] | string,
  debug: AuthorizationDecisionDebug = {},
) {
  return deny("insufficient_scope", {
    debug: {
      policyFamily,
      ...debug,
    },
  });
}

function denyInsufficientAssurance(
  policyFamily: AuthorizationResource["family"] | string,
  requiredAssurance: AuthAssuranceLevel,
) {
  return deny("insufficient_assurance", {
    requiredAssurance,
    debug: {
      policyFamily,
    },
  });
}

function authorizePlatformTenantManagement(input: AuthorizationInput): AuthorizationDecision {
  const policyFamily = "platform_tenant_management" as const;
  const supportedActions: AuthorizationAction[] = [
    "create",
    "read",
    "list",
    "update",
    "change_status",
    "switch_context",
    "export",
  ];

  if (input.actor.actorType !== "internal") {
    return denyUnsupportedActor(policyFamily);
  }

  if (!supportedActions.includes(input.action)) {
    return denyUnsupportedAction(policyFamily);
  }

  if (input.actor.platformRole !== "platform_admin") {
    return denyInsufficientScope(policyFamily);
  }

  const allowedOperationsByAction: Partial<Record<AuthorizationAction, readonly string[]>> = {
    create: ["create_tenant", "issue_onboarding_link"],
    read: ["read_tenant"],
    list: ["list_tenants"],
    update: ["update_subscription", "update_entitlements"],
    change_status: ["activate_tenant", "suspend_tenant"],
  };

  const requiredOperations = allowedOperationsByAction[input.action];

  if (requiredOperations) {
    const missingProvisioningOperation = denyMissingContext(policyFamily, input.context, [
      "platformProvisioningOperation",
    ]);
    if (missingProvisioningOperation) {
      return missingProvisioningOperation;
    }

    const operation = input.context.platformProvisioningOperation;

    if (!requiredOperations.includes(operation as string)) {
      return denyUnsupportedAction(policyFamily);
    }

    if (!["create_tenant", "list_tenants"].includes(operation as string)) {
      const missingContext = denyMissingContext(policyFamily, input.context, ["targetTenantId"]);
      if (missingContext) {
        return missingContext;
      }
    }
  }

  if (
    (input.action === "switch_context" || input.action === "export") &&
    !hasRequiredAssurance(input.actor.currentAssurance, "step_up_verified")
  ) {
    return denyInsufficientAssurance(policyFamily, "step_up_verified");
  }

  return allow();
}

function authorizeTenantSettings(input: AuthorizationInput): AuthorizationDecision {
  const policyFamily = "tenant_settings" as const;
  const supportedActions: AuthorizationAction[] = ["read", "update"];

  if (input.actor.actorType !== "internal") {
    return denyUnsupportedActor(policyFamily);
  }

  if (!supportedActions.includes(input.action)) {
    return denyUnsupportedAction(policyFamily);
  }

  const missingContext = denyMissingContext(policyFamily, input.context, [
    "activeTenantId",
    "targetTenantId",
  ]);
  if (missingContext) {
    return missingContext;
  }

  if (input.actor.tenantRole !== "tenant_owner") {
    return denyInsufficientScope(policyFamily);
  }

  if (input.context.activeTenantId !== input.context.targetTenantId) {
    return denyInsufficientScope(policyFamily, {
      expectedTenantId: input.context.targetTenantId,
    });
  }

  return allow();
}

function authorizeBranchOperations(input: AuthorizationInput): AuthorizationDecision {
  const policyFamily = "branch_operations" as const;
  const supportedActions: AuthorizationAction[] = [
    "read",
    "list",
    "create",
    "update",
    "change_status",
    "switch_context",
  ];

  if (input.actor.actorType !== "internal") {
    return denyUnsupportedActor(policyFamily);
  }

  if (!supportedActions.includes(input.action)) {
    return denyUnsupportedAction(policyFamily);
  }

  const missingContext = denyMissingContext(
    policyFamily,
    input.context,
    input.action === "switch_context"
      ? ["activeTenantId", "targetTenantId", "targetBranchId"]
      : ["activeTenantId", "activeBranchId", "targetTenantId", "targetBranchId"],
  );
  if (missingContext) {
    return missingContext;
  }

  if (input.context.activeTenantId !== input.context.targetTenantId) {
    return denyInsufficientScope(policyFamily, {
      expectedTenantId: input.context.targetTenantId,
    });
  }

  if (
    input.actor.tenantRole === undefined ||
    !BRANCH_SCOPED_ROLES.includes(input.actor.tenantRole)
  ) {
    return denyInsufficientScope(policyFamily);
  }

  if (input.actor.assignedBranchIds === undefined || input.actor.assignedBranchIds.length === 0) {
    return denyInsufficientScope(policyFamily);
  }

  if (!input.actor.assignedBranchIds.includes(input.context.targetBranchId as string)) {
    return denyInsufficientScope(policyFamily, {
      expectedBranchId: input.context.targetBranchId,
    });
  }

  if (
    input.action !== "switch_context" &&
    input.context.activeBranchId !== input.context.targetBranchId
  ) {
    return denyInsufficientScope(policyFamily, {
      expectedBranchId: input.context.targetBranchId,
    });
  }

  return allow();
}

function authorizeWebsite(input: AuthorizationInput): AuthorizationDecision {
  const policyFamily = "website" as const;
  const supportedActions: AuthorizationAction[] = ["read", "update", "export"];

  if (input.actor.actorType !== "internal") {
    return denyUnsupportedActor(policyFamily);
  }

  if (!supportedActions.includes(input.action)) {
    return denyUnsupportedAction(policyFamily);
  }

  const missingContext = denyMissingContext(policyFamily, input.context, [
    "activeTenantId",
    "targetTenantId",
  ]);
  if (missingContext) {
    return missingContext;
  }

  if (input.actor.tenantRole !== "tenant_owner") {
    return denyInsufficientScope(policyFamily);
  }

  if (input.context.activeTenantId !== input.context.targetTenantId) {
    return denyInsufficientScope(policyFamily, {
      expectedTenantId: input.context.targetTenantId,
    });
  }

  if (
    (input.action === "update" || input.action === "export") &&
    !hasRequiredAssurance(input.actor.currentAssurance, "step_up_verified")
  ) {
    return denyInsufficientAssurance(policyFamily, "step_up_verified");
  }

  return allow();
}

function authorizeCustomerAccount(input: AuthorizationInput): AuthorizationDecision {
  const policyFamily = "customer_account" as const;
  const supportedActions: AuthorizationAction[] = ["read", "update"];

  if (input.actor.actorType !== "customer") {
    return denyUnsupportedActor(policyFamily);
  }

  if (!supportedActions.includes(input.action)) {
    return denyUnsupportedAction(policyFamily);
  }

  const missingContext = denyMissingContext(policyFamily, input.context, [
    "resourceOwnerSubjectId",
  ]);
  if (missingContext) {
    return missingContext;
  }

  if (input.actor.subjectId !== input.context.resourceOwnerSubjectId) {
    return deny("self_access_only", {
      debug: {
        policyFamily,
      },
    });
  }

  return allow();
}

export function authorize(input: AuthorizationInput): AuthorizationDecision {
  switch ((input.resource as { family?: string }).family) {
    case "platform_tenant_management":
      return authorizePlatformTenantManagement(input);
    case "tenant_settings":
      return authorizeTenantSettings(input);
    case "branch_operations":
      return authorizeBranchOperations(input);
    case "website":
      return authorizeWebsite(input);
    case "customer_account":
      return authorizeCustomerAccount(input);
    default:
      return deny("unsupported_resource", {
        debug: {
          policyFamily: String((input.resource as { family?: string }).family ?? "unknown"),
        },
      });
  }
}
