import { randomUUID } from "node:crypto";

import { inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  authAccountEvents,
  authSessions,
  authSubjects,
  closeDatabasePool,
  createDatabaseClient,
  createDatabasePool,
  getDatabaseRuntimeConfig,
} from "@vision/db";

import {
  createAuthnService,
  hashPassword,
  normalizeLoginIdentifier,
} from "./index";

const AUTHN_INTEGRATION_TIMEOUT_MS = 20_000;

const { databaseUrl } = getDatabaseRuntimeConfig(process.env);
const pool = createDatabasePool(databaseUrl);
const db = createDatabaseClient(pool);
const authn = createAuthnService(db, {
  sessionTtlMs: 60 * 60 * 1000,
});
let createdSubjectIds: string[] = [];
let createdSessionIds: string[] = [];

async function seedSubject(
  subjectType: "customer" | "internal",
  loginIdentifier: string,
  password: string,
) {
  const id = `sub_${randomUUID()}`;
  createdSubjectIds.push(id);

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
  beforeEach(() => {
    createdSubjectIds = [];
    createdSessionIds = [];
  });

  afterEach(async () => {
    if (createdSessionIds.length > 0) {
      await db
        .delete(authAccountEvents)
        .where(inArray(authAccountEvents.sessionId, createdSessionIds));
      await db.delete(authSessions).where(inArray(authSessions.id, createdSessionIds));
    }

    if (createdSubjectIds.length > 0) {
      await db
        .delete(authAccountEvents)
        .where(inArray(authAccountEvents.subjectId, createdSubjectIds));
      await db.delete(authSubjects).where(inArray(authSubjects.id, createdSubjectIds));
    }
  });

  afterAll(async () => {
    await closeDatabasePool(pool);
  });

  it(
    "logs in an enabled subject and resolves the active session",
    async () => {
      const loginIdentifier = `customer+${randomUUID()}@vision.test`;
      const subject = await seedSubject(
        "customer",
        loginIdentifier,
        "S3cure-password!",
      );

      const login = await authn.login({
        subjectType: "customer",
        loginIdentifier,
        password: "S3cure-password!",
      });
      createdSessionIds.push(login.session.sessionId);

      expect(login.subject).toMatchObject({
        id: subject.id,
        subjectType: "customer",
        loginIdentifier,
      });

      const resolved = await authn.resolveSession({
        token: login.sessionToken,
      });

      expect(resolved.subject.id).toBe(subject.id);
      expect(resolved.session.sessionId).toBe(login.session.sessionId);
    },
    AUTHN_INTEGRATION_TIMEOUT_MS,
  );

  it(
    "rejects invalid credentials without creating a session",
    async () => {
      const loginIdentifier = `ops+${randomUUID()}@vision.test`;
      await seedSubject("internal", loginIdentifier, "S3cure-password!");

      await expect(
        authn.login({
          subjectType: "internal",
          loginIdentifier,
          password: "wrong-password",
        }),
      ).rejects.toMatchObject({
        code: "invalid_credentials",
      });

      await expect(db.select().from(authSessions)).resolves.toHaveLength(0);
    },
    AUTHN_INTEGRATION_TIMEOUT_MS,
  );
});
