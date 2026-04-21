export const tenancyPackageName = "@vision/tenancy" as const;

export {
  TenancyError,
  isTenancyError,
  requireResolvedTenancyContext,
} from "./errors";
export { toDatabaseAccessContext } from "./db-context";
export { resolveInternalTenancyContext } from "./resolve-internal-tenancy-context";
export type {
  ActiveTenantAccessSnapshot,
  DatabaseAccessContext,
  RawRouteIntent,
  ResolvedTenancyContext,
  TenancyErrorCode,
} from "./types";
