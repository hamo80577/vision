export const authnPackageName = "@vision/authn" as const;
export { AuthnError, isAuthnError, type AuthnErrorCode } from "./errors";
export { hashPassword, verifyPassword } from "./password";
export {
  createAuthnService,
  normalizeLoginIdentifier,
  type AuthResolution,
  type AuthSessionSummary,
  type AuthSubjectSummary,
  type AuthSubjectType,
  type AuthnService,
} from "./service";
export {
  createSessionToken,
  hashSessionSecret,
  parseSessionToken,
  verifySessionSecret,
} from "./session-token";
