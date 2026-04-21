import type { AuthResolution, AuthnErrorCode } from "@vision/authn";
import {
  ProblemError,
  getProblemDefinitionForStatus
} from "@vision/observability";

type RequestAuthState = {
  auth: AuthResolution | null;
  authFailure: AuthnErrorCode | null;
};

export function getAuthFailureDetail(code: AuthnErrorCode | null): string {
  switch (code) {
    case "invalid_credentials":
      return "Invalid login credentials.";
    case "expired_session":
      return "Session has expired.";
    case "revoked_session":
      return "Session has been revoked.";
    default:
      return "Authentication required.";
  }
}

export function createUnauthenticatedProblem(detail: string): ProblemError {
  return new ProblemError({
    ...getProblemDefinitionForStatus(401),
    detail
  });
}

export function requireAuthenticatedRequest(request: RequestAuthState): AuthResolution {
  if (request.auth) {
    return request.auth;
  }

  throw createUnauthenticatedProblem(getAuthFailureDetail(request.authFailure));
}
