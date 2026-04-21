import type { AuthAssuranceLevel } from "@vision/authn";

import type {
  AuthorizationDecision,
  AuthorizationDecisionDebug,
  AuthorizationDeniedCode
} from "./types";

const AUTHZ_ERROR_NAME = "AuthzError";

const AUTHZ_ERROR_MESSAGES: Record<AuthorizationDeniedCode, string> = {
  unsupported_actor: "Actor type is not supported for this resource.",
  unsupported_resource: "Resource family is not supported.",
  unsupported_action: "Action is not supported for this resource.",
  missing_context: "Required authorization context is missing.",
  insufficient_scope: "Actor scope does not permit this action.",
  insufficient_assurance: "Higher assurance is required for this action.",
  self_access_only: "This resource only permits explicit self-access.",
  explicit_deny: "This action is explicitly denied by policy."
};

export type AuthzErrorOptions = {
  requiredAssurance?: AuthAssuranceLevel;
  debug?: AuthorizationDecisionDebug;
};

export class AuthzError extends Error {
  readonly code: AuthorizationDeniedCode;
  readonly requiredAssurance?: AuthAssuranceLevel;
  readonly debug?: AuthorizationDecisionDebug;

  constructor(code: AuthorizationDeniedCode, options: AuthzErrorOptions = {}) {
    super(AUTHZ_ERROR_MESSAGES[code]);
    this.name = AUTHZ_ERROR_NAME;
    this.code = code;
    this.requiredAssurance = options.requiredAssurance;
    this.debug = options.debug;
  }
}

export function isAuthzError(value: unknown): value is AuthzError {
  return value instanceof AuthzError;
}

export function requireAuthorization(
  decision: AuthorizationDecision
): asserts decision is Extract<AuthorizationDecision, { allowed: true }> {
  if (decision.allowed) {
    return;
  }

  throw new AuthzError(decision.code, {
    requiredAssurance: decision.requiredAssurance,
    debug: decision.debug
  });
}
