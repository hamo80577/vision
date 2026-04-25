type LoginResponse =
  | { kind: "session" }
  | {
      kind: "mfa_challenge";
      challengeToken: string;
      challengeId: string;
      nextStep: "mfa_enrollment_required" | "mfa_verification_required";
      reason: "mfa_enrollment" | "login_mfa";
      requiredAssurance: "mfa_verified";
      expiresAt: string;
    };

type ApiProblem = {
  code?: string;
  detail?: string;
  title?: string;
};

export type MfaEnrollmentStartResult = {
  manualEntryKey: string;
  otpauthUrl: string;
};

export type VerifyMfaEnrollmentResult = {
  backupCodes: string[];
};

async function readProblem(response: Response): Promise<ApiProblem> {
  try {
    return (await response.json()) as ApiProblem;
  } catch {
    return {};
  }
}

function toMessage(problem: ApiProblem, fallback: string): string {
  return problem.detail ?? problem.title ?? fallback;
}

export async function loginInternal(input: {
  apiBaseUrl: string;
  loginIdentifier: string;
  password: string;
}): Promise<LoginResponse> {
  const response = await fetch(`${input.apiBaseUrl}/auth/internal/login`, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      loginIdentifier: input.loginIdentifier,
      password: input.password,
    }),
  });

  if (response.status === 202) {
    return (await response.json()) as LoginResponse;
  }

  if (!response.ok) {
    throw new Error(toMessage(await readProblem(response), "Sign-in failed."));
  }

  return { kind: "session" };
}

export async function startMfaEnrollment(input: {
  accountName: string;
  apiBaseUrl: string;
  challengeToken: string;
}): Promise<MfaEnrollmentStartResult> {
  const response = await fetch(`${input.apiBaseUrl}/auth/internal/mfa/enrollment/start`, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      challengeToken: input.challengeToken,
      accountName: input.accountName,
    }),
  });

  if (!response.ok) {
    throw new Error(
      toMessage(await readProblem(response), "Could not start MFA enrollment."),
    );
  }

  return (await response.json()) as MfaEnrollmentStartResult;
}

export async function verifyMfaEnrollment(input: {
  apiBaseUrl: string;
  challengeToken: string;
  code: string;
}): Promise<VerifyMfaEnrollmentResult> {
  const response = await fetch(`${input.apiBaseUrl}/auth/internal/mfa/enrollment/verify`, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      challengeToken: input.challengeToken,
      code: input.code,
    }),
  });

  if (!response.ok) {
    throw new Error(toMessage(await readProblem(response), "Could not verify MFA enrollment."));
  }

  return (await response.json()) as VerifyMfaEnrollmentResult;
}

export async function verifyMfaChallenge(input: {
  apiBaseUrl: string;
  backupCode?: string;
  challengeToken: string;
  code?: string;
}): Promise<void> {
  const response = await fetch(`${input.apiBaseUrl}/auth/internal/mfa/verify`, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      challengeToken: input.challengeToken,
      code: input.code || undefined,
      backupCode: input.backupCode || undefined,
    }),
  });

  if (!response.ok) {
    throw new Error(toMessage(await readProblem(response), "Could not verify MFA challenge."));
  }
}
