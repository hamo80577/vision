import { cookies } from "next/headers";

import { getPlatformRuntimeConfig } from "./runtime-config";

const AUTH_CSRF_COOKIE_NAME = "vision_auth_csrf";
const AUTH_CSRF_HEADER_NAME = "x-vision-csrf-token";

type PlatformApiProblem = {
  code?: string;
  detail?: string;
  title?: string;
};

export class PlatformApiError extends Error {
  readonly code: string | null;
  readonly status: number;

  constructor(status: number, problem: PlatformApiProblem, fallback: string) {
    super(problem.detail ?? problem.title ?? fallback);
    this.name = "PlatformApiError";
    this.code = problem.code ?? null;
    this.status = status;
  }
}

export async function getPlatformApiCookieHeader() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  return cookieHeader ? { cookie: cookieHeader } : undefined;
}

async function getPlatformApiCsrfHeader() {
  const cookieStore = await cookies();
  const csrfToken = cookieStore.get(AUTH_CSRF_COOKIE_NAME)?.value;

  return csrfToken ? { [AUTH_CSRF_HEADER_NAME]: csrfToken } : undefined;
}

async function readProblem(response: Response): Promise<PlatformApiProblem> {
  try {
    return (await response.json()) as PlatformApiProblem;
  } catch {
    return {};
  }
}

export async function fetchPlatformApi<T>(path: string): Promise<T> {
  const config = getPlatformRuntimeConfig();
  const response = await fetch(`${config.publicApiBaseUrl}${path}`, {
    cache: "no-store",
    headers: await getPlatformApiCookieHeader(),
  });

  if (!response.ok) {
    throw new PlatformApiError(
      response.status,
      await readProblem(response),
      `Platform API request failed for ${path}.`,
    );
  }

  return (await response.json()) as T;
}

export async function mutatePlatformApi<TResponse, TBody>(input: {
  body: TBody;
  method: "POST" | "PUT";
  path: string;
}): Promise<TResponse> {
  const config = getPlatformRuntimeConfig();
  const response = await fetch(`${config.publicApiBaseUrl}${input.path}`, {
    method: input.method,
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      ...(await getPlatformApiCookieHeader()),
      ...(await getPlatformApiCsrfHeader()),
    },
    body: JSON.stringify(input.body),
  });

  if (!response.ok) {
    throw new PlatformApiError(
      response.status,
      await readProblem(response),
      `Platform API request failed for ${input.path}.`,
    );
  }

  return (await response.json()) as TResponse;
}
