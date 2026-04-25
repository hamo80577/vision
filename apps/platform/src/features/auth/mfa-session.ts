import type { MfaEnrollmentStartResult } from "./api";

type PlatformMfaSessionState = {
  challengeToken: string;
  enrollment: MfaEnrollmentStartResult | null;
  loginIdentifier: string;
  nextStep: "mfa_enrollment_required" | "mfa_verification_required";
};

const STORAGE_KEY = "vision.platform.mfa-session";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function normalizeEnrollment(
  enrollment: unknown,
): MfaEnrollmentStartResult | null {
  if (!enrollment || typeof enrollment !== "object") {
    return null;
  }

  const candidate = enrollment as Partial<MfaEnrollmentStartResult>;

  if (
    typeof candidate.manualEntryKey !== "string" ||
    typeof candidate.otpauthUrl !== "string" ||
    candidate.manualEntryKey.length === 0 ||
    candidate.otpauthUrl.length === 0
  ) {
    return null;
  }

  return {
    manualEntryKey: candidate.manualEntryKey,
    otpauthUrl: candidate.otpauthUrl,
  };
}

export function persistPlatformMfaSession(state: PlatformMfaSessionState) {
  if (!canUseStorage()) {
    return;
  }

  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function readPlatformMfaSession(): PlatformMfaSessionState | null {
  if (!canUseStorage()) {
    return null;
  }

  const raw = window.sessionStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as PlatformMfaSessionState;

    if (
      typeof parsed.challengeToken !== "string" ||
      typeof parsed.loginIdentifier !== "string" ||
      (parsed.nextStep !== "mfa_enrollment_required" &&
        parsed.nextStep !== "mfa_verification_required")
    ) {
      return null;
    }

    return {
      ...parsed,
      enrollment: normalizeEnrollment(parsed.enrollment),
    };
  } catch {
    return null;
  }
}

export function updatePlatformMfaEnrollment(enrollment: MfaEnrollmentStartResult) {
  const current = readPlatformMfaSession();

  if (!current) {
    return;
  }

  persistPlatformMfaSession({
    ...current,
    enrollment,
  });
}

export function clearPlatformMfaSession() {
  if (!canUseStorage()) {
    return;
  }

  window.sessionStorage.removeItem(STORAGE_KEY);
}
