export type AuthAssuranceLevel = "basic" | "mfa_verified" | "step_up_verified";

export type AssuranceDenialReason =
  | "mfa_required"
  | "step_up_required"
  | "step_up_stale";

const AUTH_ASSURANCE_RANK: Record<AuthAssuranceLevel, number> = {
  basic: 0,
  mfa_verified: 1,
  step_up_verified: 2,
};

export function compareAssuranceLevels(
  left: AuthAssuranceLevel,
  right: AuthAssuranceLevel,
): number {
  return AUTH_ASSURANCE_RANK[left] - AUTH_ASSURANCE_RANK[right];
}

export function resolveAssuranceFailure(input: {
  currentAssurance: AuthAssuranceLevel;
  requiredAssurance: AuthAssuranceLevel;
  assuranceUpdatedAt: Date;
  now: Date;
  maxAgeMs?: number;
}): AssuranceDenialReason | null {
  if (compareAssuranceLevels(input.currentAssurance, input.requiredAssurance) < 0) {
    return input.requiredAssurance === "mfa_verified"
      ? "mfa_required"
      : "step_up_required";
  }

  if (
    input.maxAgeMs !== undefined &&
    input.assuranceUpdatedAt.getTime() + input.maxAgeMs < input.now.getTime()
  ) {
    return "step_up_stale";
  }

  return null;
}
