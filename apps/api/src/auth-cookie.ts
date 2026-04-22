import type { FastifyReply, FastifyRequest } from "fastify";

import { createCsrfToken } from "@vision/authn";
import type { AppEnvironment } from "@vision/config";

export const AUTH_SESSION_COOKIE_NAME = "vision_auth_session";
export const AUTH_CSRF_COOKIE_NAME = "vision_auth_csrf";
export const AUTH_CSRF_HEADER_NAME = "x-vision-csrf-token";

function shouldUseSecureCookies(appEnv: AppEnvironment): boolean {
  return appEnv === "staging" || appEnv === "production";
}

function getSessionCookieOptions(appEnv: AppEnvironment, expiresAt?: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: shouldUseSecureCookies(appEnv),
    expires: expiresAt,
  };
}

function getCsrfCookieOptions(appEnv: AppEnvironment, expiresAt?: Date) {
  return {
    httpOnly: false,
    sameSite: "lax" as const,
    path: "/",
    secure: shouldUseSecureCookies(appEnv),
    expires: expiresAt,
  };
}

export function readAuthCookie(request: FastifyRequest): string | undefined {
  return request.cookies[AUTH_SESSION_COOKIE_NAME];
}

export function readAuthCsrfCookie(request: FastifyRequest): string | undefined {
  return request.cookies[AUTH_CSRF_COOKIE_NAME];
}

export function setAuthCookie(
  reply: FastifyReply,
  appEnv: AppEnvironment,
  token: string,
  expiresAt: Date,
): void {
  reply.setCookie(
    AUTH_SESSION_COOKIE_NAME,
    token,
    getSessionCookieOptions(appEnv, expiresAt),
  );
  reply.setCookie(
    AUTH_CSRF_COOKIE_NAME,
    createCsrfToken(),
    getCsrfCookieOptions(appEnv, expiresAt),
  );
}

export function clearAuthCookie(reply: FastifyReply, appEnv: AppEnvironment): void {
  reply.clearCookie(AUTH_SESSION_COOKIE_NAME, getSessionCookieOptions(appEnv));
  reply.clearCookie(AUTH_CSRF_COOKIE_NAME, getCsrfCookieOptions(appEnv));
}
