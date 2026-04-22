export const tenancyPackageName = "@vision/tenancy" as const;

export {
  TenancyError,
  isTenancyError,
  requireResolvedTenancyContext,
} from "./errors.js";
export { toDatabaseAccessContext } from "./db-context.js";
export { resolveInternalTenancyContext } from "./resolve-internal-tenancy-context.js";
export type {
  ActiveTenantAccessSnapshot,
  DatabaseAccessContext,
  RawRouteIntent,
  ResolvedTenancyContext,
  TenancyErrorCode,
} from "./types.js";
