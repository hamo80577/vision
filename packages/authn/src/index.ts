export const authnPackageName = "@vision/authn" as const;
export { AuthnError, isAuthnError, type AuthnErrorCode } from "./errors";
export {
  compareAssuranceLevels,
  resolveAssuranceFailure,
  type AssuranceDenialReason,
  type AuthAssuranceLevel,
} from "./assurance";
export { hashPassword, verifyPassword } from "./password";
export {
  createChallengeToken,
  createTotpProvisioning,
  decryptTotpSecret,
  encryptTotpSecret,
  generateBackupCodes,
  generateTotpSecret,
  parseChallengeToken,
  verifyBackupCodeHash,
  verifyChallengeSecret,
  verifyTotpCode,
} from "./mfa";
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
