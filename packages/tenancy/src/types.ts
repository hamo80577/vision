export type RawRouteIntent = {
  surface: "erp" | "platform";
  requestedScope: "global" | "tenant" | "branch" | "branch_switch";
  tenantIntent?: {
    source: "path" | "slug" | "host" | "payload";
    rawValue: string;
  };
  branchIntent?: {
    source: "path" | "query" | "payload";
    rawValue: string;
  };
};

export type ActiveTenantAccessSnapshot = {
  tenantId: string;
  tenantRole?: "tenant_owner" | "branch_manager" | "receptionist" | "cashier";
  allowedBranchIds: string[];
};

export type ResolvedTenancyContext = {
  surface: "erp";
  scope: "tenant" | "branch";
  sessionId: string;
  subjectId: string;
  activeTenantId: string;
  activeBranchId: string | null;
  targetTenantId: string;
  targetBranchId: string | null;
  routeIntent: RawRouteIntent;
  access: ActiveTenantAccessSnapshot;
  branchSwitch: {
    requested: boolean;
    persisted: boolean;
    previousBranchId: string | null;
    nextBranchId: string | null;
  };
};

export type DatabaseAccessContext = {
  tenantId: string;
  branchId: string | null;
  subjectId: string;
  subjectType: "internal";
  sessionId: string;
};

export type TenancyErrorCode =
  | "unsupported_execution_surface"
  | "platform_tenant_execution_disabled"
  | "missing_active_tenant_context"
  | "missing_active_branch_context"
  | "tenant_intent_mismatch"
  | "branch_intent_mismatch"
  | "invalid_branch_switch_target"
  | "branch_not_in_active_tenant_scope"
  | "tenant_db_context_required";
