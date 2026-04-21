import type { DatabaseAccessContext, ResolvedTenancyContext } from "./types";

export function toDatabaseAccessContext(
  context: ResolvedTenancyContext,
): DatabaseAccessContext {
  return {
    tenantId: context.targetTenantId,
    branchId: context.targetBranchId,
    subjectId: context.subjectId,
    subjectType: "internal",
    sessionId: context.sessionId,
  };
}
