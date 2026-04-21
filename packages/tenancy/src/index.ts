export const tenancyPackageName = "@vision/tenancy" as const;

export {
  TenancyError,
  isTenancyError,
  requireResolvedTenancyContext,
} from "./errors";
export type {
  ActiveTenantAccessSnapshot,
  DatabaseAccessContext,
  RawRouteIntent,
  ResolvedTenancyContext,
  TenancyErrorCode,
} from "./types";
