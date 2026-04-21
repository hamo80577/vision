import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  authAccountEvents,
  authSessions,
  authSubjects,
  closeDatabasePool,
  createDatabaseClient,
  createDatabasePool,
} from "@vision/db";

import {
  AuthnError,
  createAuthnService,
  hashPassword,
  normalizeLoginIdentifier,
} from "./index";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://vision_local:vision_local_password@localhost:5433/vision_local";
const pool = createDatabasePool(databaseUrl);
const db = createDatabaseClient(pool);
const authn = createAuthnService(db, {
  sessionTtlMs: 60 * 60 * 1000,
});

async function seedSubject(
  subjectType: "customer" | "internal",
  loginIdentifier: string,
  password: string,
) {
  const id = `sub_${randomUUID()}`;

  await db.insert(authSubjects).values({
    id,
    subjectType,
    loginIdentifier,
    normalizedLoginIdentifier: normalizeLoginIdentifier(loginIdentifier),
    passwordHash: await hashPassword(password),
  });

  return { id };
}

describe("createAuthnService", () => {
  beforeEach(async () => {
    await db.delete(authAccountEvents);
    await db.delete(authSessions);
    await db.delete(authSubjects);
  });

  afterAll(async () => {
    await closeDatabasePool(pool);
  });

  it("logs in an enabled subject and resolves the active session", async () => {
    const subject = await seedSubject(
      "customer",
      "Customer@Vision.test",
      "S3cure-password!",
    );

    const login = await authn.login({
      subjectType: "customer",
      loginIdentifier: "customer@vision.test",
      password: "S3cure-password!",
    });

    expect(login.subject).toMatchObject({
      id: subject.id,
      subjectType: "customer",
      loginIdentifier: "Customer@Vision.test",
    });

    const resolved = await authn.resolveSession({
      token: login.sessionToken,
    });

    expect(resolved.subject.id).toBe(subject.id);
    expect(resolved.session.sessionId).toBe(login.session.sessionId);
  });

  it("rejects invalid credentials without creating a session", async () => {
    await seedSubject("internal", "ops@vision.test", "S3cure-password!");

    await expect(
      authn.login({
        subjectType: "internal",
        loginIdentifier: "ops@vision.test",
        password: "wrong-password",
      }),
    ).rejects.toMatchObject<AuthnError>({
      code: "invalid_credentials",
    });

    await expect(db.select().from(authSessions)).resolves.toHaveLength(0);
  });
});
