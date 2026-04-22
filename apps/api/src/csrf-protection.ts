import type { FastifyRequest } from "fastify";

import { csrfTokensMatch } from "@vision/authn";
import { ProblemError } from "@vision/observability";

import {
  AUTH_CSRF_HEADER_NAME,
  readAuthCsrfCookie,
} from "./auth-cookie";

const SAFE_HTTP_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function requiresCsrfProtection(request: FastifyRequest): boolean {
  return request.routeOptions.config.csrfProtected === true;
}

function readCsrfHeader(request: FastifyRequest): string | null {
  const value = request.headers[AUTH_CSRF_HEADER_NAME];

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && value.length === 1 && typeof value[0] === "string") {
    return value[0];
  }

  return null;
}

function createCsrfProblem(): ProblemError {
  return new ProblemError({
    status: 403,
    code: "csrf_token_invalid",
    title: "Forbidden",
    type: "https://vision.local/problems/csrf-token-invalid",
    detail: "A valid CSRF token is required.",
  });
}

export function createCsrfProtectionHook() {
  return async function csrfProtection(request: FastifyRequest) {
    if (SAFE_HTTP_METHODS.has(request.method)) {
      return;
    }

    if (!requiresCsrfProtection(request) || !request.auth) {
      return;
    }

    const cookieToken = readAuthCsrfCookie(request);
    const headerToken = readCsrfHeader(request);

    if (!cookieToken || !headerToken || !csrfTokensMatch(cookieToken, headerToken)) {
      throw createCsrfProblem();
    }
  };
}
