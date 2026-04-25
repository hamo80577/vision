const OWNER_ACTIVATION_ERROR_NAME = "OwnerActivationError";

export type OwnerActivationErrorCode =
  | "activation_link_invalid"
  | "activation_link_expired"
  | "activation_link_revoked"
  | "activation_link_consumed"
  | "activation_subject_conflict";

const OWNER_ACTIVATION_ERROR_MESSAGES: Record<OwnerActivationErrorCode, string> = {
  activation_link_invalid: "Activation link is invalid.",
  activation_link_expired: "Activation link has expired.",
  activation_link_revoked: "Activation link has been revoked.",
  activation_link_consumed: "Activation link has already been used.",
  activation_subject_conflict: "An internal account already exists for this owner.",
};

export class OwnerActivationError extends Error {
  readonly code: OwnerActivationErrorCode;

  constructor(code: OwnerActivationErrorCode, message?: string) {
    super(message ?? OWNER_ACTIVATION_ERROR_MESSAGES[code]);
    this.name = OWNER_ACTIVATION_ERROR_NAME;
    this.code = code;
  }
}

export function isOwnerActivationError(value: unknown): value is OwnerActivationError {
  return value instanceof OwnerActivationError;
}
