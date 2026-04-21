import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  createAuthnService,
  hashPassword,
  normalizeLoginIdentifier,
} from "@vision/authn";
import {
  authAccountEvents,
  authSessions,
  authSubjects,
  closeDatabasePool,
  createDatabaseClient,
  createDatabasePool,
} from "@vision/db";

import { AUTH_SESSION_COOKIE_NAME } from "./auth-cookie";
import { buildApi } from "./server";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://vision_local:vision_local_password@localhost:5433/vision_local";

const runtime = {
  appEnv: "local",
  host: "127.0.0.1",
  port: 4000,
  databaseUrl,
  logLevel: "debug",
  serviceName: "vision-api",
} as const;

const pool = createDatabasePool(databaseUrl);
const db = createDatabaseClient(pool);
const authn = createAuthnService(db, {
  sessionTtlMs: 60 * 60 * 1000,
});

function getAuthCookie(setCookie: string | string[] | undefined): string {
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;

  if (!raw) {
    throw new Error("Missing Set-Cookie header.");
  }

  return raw.split(";")[0] ?? raw;
}

async function seedSubject(
  subjectType: "customer" | "internal",
  loginIdentifier: string,
  password: string,
) {
  await db.insert(authSubjects).values({
    id: `sub_${randomUUID()}`,
    subjectType,
    loginIdentifier,
    normalizedLoginIdentifier: normalizeLoginIdentifier(loginIdentifier),
    passwordHash: await hashPassword(password),
  });
}

describe("auth routes", () => {
  beforeEach(async () => {
    await db.delete(authAccountEvents);
    await db.delete(authSessions);
    await db.delete(authSubjects);
  });

  afterAll(async () => {
    await closeDatabasePool(pool);
  });

  it("logs in a customer and resolves the current session", async () => {
    const api = buildApi({ runtime, authService: authn });
    await seedSubject("customer", "customer@vision.test", "S3cure-password!");

    const login = await api.inject({
      method: "POST",
      url: "/auth/customer/login",
      payload: {
        loginIdentifier: "customer@vision.test",
        password: "S3cure-password!",
      },
    });

    expect(login.statusCode).toBe(200);
    expect(login.headers["set-cookie"]).toEqual(expect.any(String));
    expect(login.headers["set-cookie"]).toContain("HttpOnly");
    expect(login.headers["set-cookie"]).toContain("SameSite=Lax");
    expect(login.headers["set-cookie"]).toContain("Path=/");
    expect(login.headers["set-cookie"]).not.toContain("Secure");

    const session = await api.inject({
      method: "GET",
      url: "/auth/session",
      headers: {
        cookie: getAuthCookie(login.headers["set-cookie"]),
      },
    });

    expect(session.statusCode).toBe(200);
    expect(session.json()).toMatchObject({
      subject: {
        subjectType: "customer",
        loginIdentifier: "customer@vision.test",
      },
    });

    await api.close();
  });

  it("logs in an internal subject and resolves the current session", async () => {
    const api = buildApi({ runtime, authService: authn });
    await seedSubject("internal", "ops@vision.test", "S3cure-password!");

    const login = await api.inject({
      method: "POST",
      url: "/auth/internal/login",
      payload: {
        loginIdentifier: "ops@vision.test",
        password: "S3cure-password!",
      },
    });

    const session = await api.inject({
      method: "GET",
      url: "/auth/session",
      headers: {
        cookie: getAuthCookie(login.headers["set-cookie"]),
      },
    });

    expect(session.statusCode).toBe(200);
    expect(session.json()).toMatchObject({
      subject: {
        subjectType: "internal",
      },
    });

    await api.close();
  });

  it("rejects expired sessions", async () => {
    const api = buildApi({ runtime, authService: authn });
    await seedSubject("customer", "expired@vision.test", "S3cure-password!");

    const login = await api.inject({
      method: "POST",
      url: "/auth/customer/login",
      payload: {
        loginIdentifier: "expired@vision.test",
        password: "S3cure-password!",
      },
    });
    const cookie = getAuthCookie(login.headers["set-cookie"]);
    const sessionId = cookie.replace(`${AUTH_SESSION_COOKIE_NAME}=`, "").split(".")[0];

    await db
      .update(authSessions)
      .set({
        expiresAt: new Date("2026-01-01T00:00:00.000Z"),
      })
      .where(eq(authSessions.id, sessionId));

    const response = await api.inject({
      method: "GET",
      url: "/auth/session",
      headers: {
        cookie,
      },
    });

    expect(response.statusCode).toBe(401);

    await api.close();
  });

  it("rejects revoked sessions and clears the cookie", async () => {
    const api = buildApi({ runtime, authService: authn });
    await seedSubject("internal", "revoked@vision.test", "S3cure-password!");

    const login = await api.inject({
      method: "POST",
      url: "/auth/internal/login",
      payload: {
        loginIdentifier: "revoked@vision.test",
        password: "S3cure-password!",
      },
    });

    const cookie = getAuthCookie(login.headers["set-cookie"]);
    await authn.logout({
      token: cookie.replace(`${AUTH_SESSION_COOKIE_NAME}=`, ""),
    });

    const response = await api.inject({
      method: "GET",
      url: "/auth/session",
      headers: {
        cookie,
      },
    });

    expect(response.statusCode).toBe(401);

    await api.close();
  });

  it("revokes the current session on logout and prevents reuse", async () => {
    const api = buildApi({ runtime, authService: authn });
    await seedSubject("customer", "logout@vision.test", "S3cure-password!");

    const login = await api.inject({
      method: "POST",
      url: "/auth/customer/login",
      payload: {
        loginIdentifier: "logout@vision.test",
        password: "S3cure-password!",
      },
    });

    const cookie = getAuthCookie(login.headers["set-cookie"]);
    const logout = await api.inject({
      method: "POST",
      url: "/auth/logout",
      headers: {
        cookie,
      },
    });

    expect(logout.statusCode).toBe(204);
    expect(logout.headers["set-cookie"]).toContain(`${AUTH_SESSION_COOKIE_NAME}=`);

    const reused = await api.inject({
      method: "GET",
      url: "/auth/session",
      headers: {
        cookie,
      },
    });

    expect(reused.statusCode).toBe(401);

    await api.close();
  });

  it("invalidates the previous token after rotation", async () => {
    const api = buildApi({ runtime, authService: authn });
    await seedSubject("internal", "rotate@vision.test", "S3cure-password!");

    const login = await api.inject({
      method: "POST",
      url: "/auth/internal/login",
      payload: {
        loginIdentifier: "rotate@vision.test",
        password: "S3cure-password!",
      },
    });

    const originalCookie = getAuthCookie(login.headers["set-cookie"]);
    const rotated = await authn.rotateSession({
      token: originalCookie.replace(`${AUTH_SESSION_COOKIE_NAME}=`, ""),
    });

    const oldTokenResponse = await api.inject({
      method: "GET",
      url: "/auth/session",
      headers: {
        cookie: originalCookie,
      },
    });

    const newTokenResponse = await api.inject({
      method: "GET",
      url: "/auth/session",
      headers: {
        cookie: `${AUTH_SESSION_COOKIE_NAME}=${rotated.sessionToken}`,
      },
    });

    expect(oldTokenResponse.statusCode).toBe(401);
    expect(newTokenResponse.statusCode).toBe(200);

    await api.close();
  });
});
