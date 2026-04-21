import { TenancyError } from "./errors.js";
import type {
  ActiveTenantAccessSnapshot,
  RawRouteIntent,
  ResolvedTenancyContext,
} from "./types.js";

type InternalSessionTenancyState = {
  sessionId: string;
  subjectId: string;
  subjectType: "internal";
  activeTenantId: string | null;
  activeBranchId: string | null;
};

type InternalTenancyResolutionInput = {
  routeIntent: RawRouteIntent;
  session: InternalSessionTenancyState;
  access: ActiveTenantAccessSnapshot | null;
};

function readRawIntentValue(
  intent: RawRouteIntent["tenantIntent"] | RawRouteIntent["branchIntent"],
): string | null {
  const rawValue = intent?.rawValue?.trim();
  return rawValue ? rawValue : null;
}

function requireActiveTenantId(session: InternalSessionTenancyState): string {
  if (!session.activeTenantId) {
    throw new TenancyError("missing_active_tenant_context");
  }

  return session.activeTenantId;
}

function requireAccess(
  access: ActiveTenantAccessSnapshot | null,
): ActiveTenantAccessSnapshot {
  if (!access) {
    throw new TenancyError("missing_active_tenant_context");
  }

  return access;
}

export function resolveInternalTenancyContext(
  input: InternalTenancyResolutionInput,
): ResolvedTenancyContext {
  if (input.routeIntent.surface !== "erp") {
    throw new TenancyError(
      input.routeIntent.surface === "platform"
        ? "platform_tenant_execution_disabled"
        : "unsupported_execution_surface",
    );
  }

  if (input.routeIntent.requestedScope === "global") {
    throw new TenancyError("unsupported_tenancy_scope");
  }

  const activeTenantId = requireActiveTenantId(input.session);
  const access = requireAccess(input.access);

  if (access.tenantId !== activeTenantId) {
    throw new TenancyError("tenant_intent_mismatch");
  }

  const tenantIntent = readRawIntentValue(input.routeIntent.tenantIntent);
  if (tenantIntent && tenantIntent !== activeTenantId) {
    throw new TenancyError("tenant_intent_mismatch");
  }

  const activeBranchId = input.session.activeBranchId ?? null;
  const branchIntent = readRawIntentValue(input.routeIntent.branchIntent);
  const isSwitch = input.routeIntent.requestedScope === "branch_switch";

  if (!isSwitch && input.routeIntent.requestedScope === "branch" && !activeBranchId) {
    throw new TenancyError("missing_active_branch_context");
  }

  if (isSwitch) {
    if (!branchIntent) {
      throw new TenancyError("invalid_branch_switch_target");
    }

    if (!access.allowedBranchIds.includes(branchIntent)) {
      throw new TenancyError("branch_not_in_active_tenant_scope");
    }

    return {
      surface: "erp",
      scope: "branch",
      sessionId: input.session.sessionId,
      subjectId: input.session.subjectId,
      activeTenantId,
      activeBranchId,
      targetTenantId: activeTenantId,
      targetBranchId: branchIntent,
      routeIntent: input.routeIntent,
      access,
      branchSwitch: {
        requested: true,
        persisted: false,
        previousBranchId: activeBranchId,
        nextBranchId: branchIntent,
      },
    };
  }

  if (branchIntent && branchIntent !== activeBranchId) {
    throw new TenancyError("branch_intent_mismatch");
  }

  return {
    surface: "erp",
    scope: input.routeIntent.requestedScope === "branch" ? "branch" : "tenant",
    sessionId: input.session.sessionId,
    subjectId: input.session.subjectId,
    activeTenantId,
    activeBranchId,
    targetTenantId: activeTenantId,
    targetBranchId: input.routeIntent.requestedScope === "branch" ? activeBranchId : null,
    routeIntent: input.routeIntent,
    access,
    branchSwitch: {
      requested: false,
      persisted: false,
      previousBranchId: activeBranchId,
      nextBranchId: activeBranchId,
    },
  };
}
