import type { FastifyReply, FastifyRequest } from "fastify";

import type { AppEnvironment } from "@vision/config";

export const AUTH_SESSION_COOKIE_NAME = "vision_auth_session";

function shouldUseSecureCookies(appEnv: AppEnvironment): boolean {
  return appEnv === "staging" || appEnv === "production";
}

function getCookieOptions(appEnv: AppEnvironment, expiresAt?: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: shouldUseSecureCookies(appEnv),
    expires: expiresAt,
  };
}

export function readAuthCookie(request: FastifyRequest): string | undefined {
  return request.cookies[AUTH_SESSION_COOKIE_NAME];
}

export function setAuthCookie(
  reply: FastifyReply,
  appEnv: AppEnvironment,
  token: string,
  expiresAt: Date,
): void {
  reply.setCookie(AUTH_SESSION_COOKIE_NAME, token, getCookieOptions(appEnv, expiresAt));
}

export function clearAuthCookie(reply: FastifyReply, appEnv: AppEnvironment): void {
  reply.clearCookie(AUTH_SESSION_COOKIE_NAME, getCookieOptions(appEnv));
}
