export type AuthnErrorCode =
  | "invalid_credentials"
  | "invalid_session_token"
  | "missing_session"
  | "expired_session"
  | "revoked_session"
  | "disabled_subject";

const AUTHN_ERROR_MESSAGES: Record<AuthnErrorCode, string> = {
  invalid_credentials: "Invalid login credentials.",
  invalid_session_token: "Invalid session token.",
  missing_session: "Authentication required.",
  expired_session: "Session has expired.",
  revoked_session: "Session has been revoked.",
  disabled_subject: "Account is disabled.",
};

export class AuthnError extends Error {
  readonly code: AuthnErrorCode;

  constructor(code: AuthnErrorCode, detail = AUTHN_ERROR_MESSAGES[code]) {
    super(detail);
    this.name = "AuthnError";
    this.code = code;
  }
}

export function isAuthnError(value: unknown): value is AuthnError {
  return value instanceof AuthnError;
}
