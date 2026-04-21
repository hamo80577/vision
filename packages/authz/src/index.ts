export const authzPackageName = "@vision/authz" as const;

export { authorize } from "./authorize";
export {
  AuthzError,
  isAuthzError,
  requireAuthorization,
  type AuthzErrorOptions
} from "./errors";
export type {
  AuthorizationAction,
  AuthorizationActorClaims,
  AuthorizationContextFacts,
  AuthorizationDecision,
  AuthorizationDecisionDebug,
  AuthorizationDeniedCode,
  AuthorizationInput,
  AuthorizationResource,
  InternalPlatformRole,
  InternalTenantRole
} from "./types";
