import type { ResolvedTenancyContext, TenancyErrorCode } from "./types";

const TENANCY_ERROR_NAME = "TenancyError";

const TENANCY_ERROR_MESSAGES: Record<TenancyErrorCode, string> = {
  unsupported_execution_surface:
    "This execution surface is not supported by the internal tenancy resolver.",
  platform_tenant_execution_disabled:
    "Platform tenant and branch execution is disabled in Phase 8.",
  missing_active_tenant_context: "Active tenant context is required.",
  missing_active_branch_context: "Active branch context is required.",
  tenant_intent_mismatch:
    "Route tenant intent does not match the active tenant context.",
  branch_intent_mismatch:
    "Route branch intent does not match the active branch context.",
  invalid_branch_switch_target: "A valid branch-switch target is required.",
  branch_not_in_active_tenant_scope:
    "The branch target is not allowed in the active tenant scope.",
  tenant_db_context_required:
    "Tenant-scoped database work requires DB access context.",
};

export class TenancyError extends Error {
  readonly code: TenancyErrorCode;

  constructor(code: TenancyErrorCode) {
    super(TENANCY_ERROR_MESSAGES[code]);
    this.name = TENANCY_ERROR_NAME;
    this.code = code;
  }
}

export function isTenancyError(value: unknown): value is TenancyError {
  return value instanceof TenancyError;
}

export function requireResolvedTenancyContext(
  context: ResolvedTenancyContext | null,
): ResolvedTenancyContext {
  if (context) {
    return context;
  }

  throw new TenancyError("missing_active_tenant_context");
}
