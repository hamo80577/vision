import type { AssuranceDenialReason, AuthAssuranceLevel } from "./assurance";

export type AuthnErrorCode =
  | "invalid_credentials"
  | "invalid_session_token"
  | "invalid_session_context"
  | "missing_session"
  | "expired_session"
  | "revoked_session"
  | "disabled_subject"
  | "invalid_assurance_challenge"
  | "expired_assurance_challenge"
  | "consumed_assurance_challenge"
  | "invalid_totp_code"
  | "invalid_backup_code"
  | "insufficient_assurance";

export type AuthnErrorContext = {
  requiredAssurance?: AuthAssuranceLevel;
  denialReason?: AssuranceDenialReason;
};

const AUTHN_ERROR_MESSAGES: Record<AuthnErrorCode, string> = {
  invalid_credentials: "Invalid login credentials.",
  invalid_session_token: "Invalid session token.",
  invalid_session_context: "Invalid session context.",
  missing_session: "Authentication required.",
  expired_session: "Session has expired.",
  revoked_session: "Session has been revoked.",
  disabled_subject: "Account is disabled.",
  invalid_assurance_challenge: "Invalid assurance challenge.",
  expired_assurance_challenge: "Assurance challenge has expired.",
  consumed_assurance_challenge: "Assurance challenge has already been consumed.",
  invalid_totp_code: "Invalid TOTP code.",
  invalid_backup_code: "Invalid backup code.",
  insufficient_assurance: "Higher assurance is required.",
};

export class AuthnError extends Error {
  readonly code: AuthnErrorCode;
  readonly context: AuthnErrorContext;

  constructor(
    code: AuthnErrorCode,
    detail = AUTHN_ERROR_MESSAGES[code],
    context: AuthnErrorContext = {},
  ) {
    super(detail);
    this.name = "AuthnError";
    this.code = code;
    this.context = context;
  }
}

export function isAuthnError(value: unknown): value is AuthnError {
  return value instanceof AuthnError;
}
