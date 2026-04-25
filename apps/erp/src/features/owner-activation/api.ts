import type {
  CompleteOwnerActivationInput,
  OwnerActivationCompletionResult,
} from "@vision/contracts";

type ApiProblem = {
  code?: string;
  detail?: string;
  title?: string;
};

export type OwnerActivationStatusCode =
  | "activation_link_invalid"
  | "activation_link_expired"
  | "activation_link_revoked"
  | "activation_link_consumed";

export type StartMfaEnrollmentResult = {
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

export async function completeOwnerActivation(input: {
  activationToken: string;
  apiBaseUrl: string;
  payload: CompleteOwnerActivationInput;
}): Promise<OwnerActivationCompletionResult> {
  const response = await fetch(
    `${input.apiBaseUrl}/owner-activation/${encodeURIComponent(input.activationToken)}/complete`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(input.payload),
    },
  );

  if (!response.ok) {
    const problem = await readProblem(response);
    const error = new Error(toMessage(problem, "Could not complete owner activation.")) as Error & {
      code?: string;
    };
    error.code = problem.code;
    throw error;
  }

  return (await response.json()) as OwnerActivationCompletionResult;
}

export async function startMfaEnrollment(input: {
  accountName: string;
  apiBaseUrl: string;
  challengeToken: string;
}): Promise<StartMfaEnrollmentResult> {
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
    throw new Error(toMessage(await readProblem(response), "Could not start MFA enrollment."));
  }

  return (await response.json()) as StartMfaEnrollmentResult;
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
