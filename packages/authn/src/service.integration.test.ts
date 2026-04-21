import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import * as OTPAuth from "otpauth";
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
const MFA_ENCRYPTION_KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

const { databaseUrl } = getDatabaseRuntimeConfig(process.env);
const pool = createDatabasePool(databaseUrl);
const db = createDatabaseClient(pool);
const authn = createAuthnService(db, {
  sessionTtlMs: 60 * 60 * 1000,
  mfaEncryptionKey: MFA_ENCRYPTION_KEY,
  mfaEncryptionKeyVersion: "v1",
  totpIssuer: "Vision",
});
let createdSubjectIds: string[] = [];
let createdSessionIds: string[] = [];

async function listSessionsForSubject(subjectId: string) {
  return db
    .select()
    .from(authSessions)
    .where(eq(authSessions.subjectId, subjectId));
}

async function seedSubject(
  subjectType: "customer" | "internal",
  loginIdentifier: string,
  password: string,
  internalSensitivity:
    | "none"
    | "platform_admin"
    | "tenant_owner"
    | "branch_manager"
    | null = null,
) {
  const id = `sub_${randomUUID()}`;
  createdSubjectIds.push(id);

  await db.insert(authSubjects).values({
    id,
    subjectType,
    loginIdentifier,
    normalizedLoginIdentifier: normalizeLoginIdentifier(loginIdentifier),
    passwordHash: await hashPassword(password),
    internalSensitivity,
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

      if (login.kind !== "session") {
        throw new Error("Expected customer login to create a session result.");
      }

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
      const subject = await seedSubject("internal", loginIdentifier, "S3cure-password!");

      await expect(
        authn.login({
          subjectType: "internal",
          loginIdentifier,
          password: "wrong-password",
        }),
      ).rejects.toMatchObject({
        code: "invalid_credentials",
      });

      await expect(listSessionsForSubject(subject.id)).resolves.toHaveLength(0);
    },
    AUTHN_INTEGRATION_TIMEOUT_MS,
  );

  it(
    "returns a pending challenge for a sensitive internal login without creating a session",
    async () => {
      const loginIdentifier = `admin+${randomUUID()}@vision.test`;
      const subject = await seedSubject(
        "internal",
        loginIdentifier,
        "S3cure-password!",
        "platform_admin",
      );

      const result = await authn.login({
        subjectType: "internal",
        loginIdentifier,
        password: "S3cure-password!",
      });

      expect(result).toMatchObject({
        kind: "mfa_challenge",
        nextStep: "mfa_enrollment_required",
        requiredAssurance: "mfa_verified",
      });
      await expect(listSessionsForSubject(subject.id)).resolves.toHaveLength(0);
    },
    AUTHN_INTEGRATION_TIMEOUT_MS,
  );

  it(
    "verifies TOTP enrollment and issues the first mfa_verified session with backup codes",
    async () => {
      const loginIdentifier = `owner+${randomUUID()}@vision.test`;
      await seedSubject("internal", loginIdentifier, "S3cure-password!", "tenant_owner");

      const login = await authn.login({
        subjectType: "internal",
        loginIdentifier,
        password: "S3cure-password!",
      });

      if (login.kind !== "mfa_challenge") {
        throw new Error("Expected MFA challenge result.");
      }

      const enrollment = await authn.startMfaEnrollment({
        challengeToken: login.challengeToken,
        accountName: loginIdentifier,
      });
      const now = new Date();
      const totp = new OTPAuth.TOTP({
        issuer: "Vision",
        label: loginIdentifier,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(enrollment.manualEntryKey),
      });
      const code = totp.generate({ timestamp: now.getTime() });
      const completed = await authn.verifyMfaEnrollment({
        challengeToken: login.challengeToken,
        code,
        now,
      });
      createdSessionIds.push(completed.session.sessionId);

      expect(completed.session.assuranceLevel).toBe("mfa_verified");
      expect(completed.backupCodes).toHaveLength(8);
      expect(completed.backupCodes[0]).not.toContain("-");
    },
    AUTHN_INTEGRATION_TIMEOUT_MS,
  );

  it(
    "uses a backup code only once across repeated sensitive logins",
    async () => {
      const loginIdentifier = `manager+${randomUUID()}@vision.test`;
      await seedSubject("internal", loginIdentifier, "S3cure-password!", "branch_manager");

      const firstLogin = await authn.login({
        subjectType: "internal",
        loginIdentifier,
        password: "S3cure-password!",
      });

      if (firstLogin.kind !== "mfa_challenge") {
        throw new Error("Expected MFA challenge result.");
      }

      const enrollment = await authn.startMfaEnrollment({
        challengeToken: firstLogin.challengeToken,
        accountName: loginIdentifier,
      });
      const now = new Date();
      const totp = new OTPAuth.TOTP({
        issuer: "Vision",
        label: loginIdentifier,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(enrollment.manualEntryKey),
      });
      const enrollmentCode = totp.generate({ timestamp: now.getTime() });
      const completedEnrollment = await authn.verifyMfaEnrollment({
        challengeToken: firstLogin.challengeToken,
        code: enrollmentCode,
        now,
      });
      createdSessionIds.push(completedEnrollment.session.sessionId);

      const backupCode = completedEnrollment.backupCodes[0];
      const secondLogin = await authn.login({
        subjectType: "internal",
        loginIdentifier,
        password: "S3cure-password!",
      });

      if (secondLogin.kind !== "mfa_challenge") {
        throw new Error("Expected MFA challenge result.");
      }

      const firstVerification = await authn.verifyMfaChallenge({
        challengeToken: secondLogin.challengeToken,
        backupCode,
        now,
      });
      createdSessionIds.push(firstVerification.session.sessionId);
      expect(firstVerification.session.assuranceLevel).toBe("mfa_verified");

      const thirdLogin = await authn.login({
        subjectType: "internal",
        loginIdentifier,
        password: "S3cure-password!",
      });

      if (thirdLogin.kind !== "mfa_challenge") {
        throw new Error("Expected MFA challenge result.");
      }

      await expect(
        authn.verifyMfaChallenge({
          challengeToken: thirdLogin.challengeToken,
          backupCode,
          now,
        }),
      ).rejects.toMatchObject({
        code: "invalid_backup_code",
      });
    },
    AUTHN_INTEGRATION_TIMEOUT_MS,
  );

  it(
    "upgrades an authenticated session to step_up_verified and rejects stale assurance",
    async () => {
      const loginIdentifier = `support+${randomUUID()}@vision.test`;
      await seedSubject("internal", loginIdentifier, "S3cure-password!", "platform_admin");

      const login = await authn.login({
        subjectType: "internal",
        loginIdentifier,
        password: "S3cure-password!",
      });

      if (login.kind !== "mfa_challenge") {
        throw new Error("Expected MFA challenge result.");
      }

      const enrollment = await authn.startMfaEnrollment({
        challengeToken: login.challengeToken,
        accountName: loginIdentifier,
      });
      const verificationTime = new Date("2026-04-21T12:00:00.000Z");
      const totp = new OTPAuth.TOTP({
        issuer: "Vision",
        label: loginIdentifier,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(enrollment.manualEntryKey),
      });
      const enrollmentCode = totp.generate({ timestamp: verificationTime.getTime() });
      const completedEnrollment = await authn.verifyMfaEnrollment({
        challengeToken: login.challengeToken,
        code: enrollmentCode,
        now: verificationTime,
      });
      createdSessionIds.push(completedEnrollment.session.sessionId);

      const stepUp = await authn.startStepUpChallenge({
        token: completedEnrollment.sessionToken,
        reason: "support_grant_activation",
      });
      const stepUpCode = totp.generate({ timestamp: verificationTime.getTime() });
      const steppedUp = await authn.verifyStepUpChallenge({
        token: completedEnrollment.sessionToken,
        challengeToken: stepUp.challengeToken,
        totpCode: stepUpCode,
        now: verificationTime,
      });

      expect(steppedUp.session.assuranceLevel).toBe("step_up_verified");

      await expect(
        authn.requireAssurance({
          token: steppedUp.sessionToken,
          requiredAssurance: "step_up_verified",
          reason: "support_grant_activation",
          now: new Date("2026-04-21T12:20:00.000Z"),
          maxAgeMs: 5 * 60 * 1000,
        }),
      ).rejects.toMatchObject({
        code: "insufficient_assurance",
        context: {
          denialReason: "step_up_stale",
        },
      });
    },
    AUTHN_INTEGRATION_TIMEOUT_MS,
  );

  it(
    "switches the active branch for an internal session and writes an audit event",
    async () => {
      const loginIdentifier = `branch-switch+${randomUUID()}@vision.test`;
      await seedSubject("internal", loginIdentifier, "S3cure-password!", "none");

      const login = await authn.login({
        subjectType: "internal",
        loginIdentifier,
        password: "S3cure-password!",
      });

      if (login.kind !== "session") {
        throw new Error("Expected session login result.");
      }

      createdSessionIds.push(login.session.sessionId);

      await db
        .update(authSessions)
        .set({
          activeTenantId: "tenant_1",
          activeBranchId: "branch_1",
        })
        .where(eq(authSessions.id, login.session.sessionId));

      const switched = await authn.switchActiveBranchContext({
        token: login.sessionToken,
        activeTenantId: "tenant_1",
        nextBranchId: "branch_2",
      });

      expect(switched.session.activeTenantId).toBe("tenant_1");
      expect(switched.session.activeBranchId).toBe("branch_2");

      const events = await db
        .select()
        .from(authAccountEvents)
        .where(eq(authAccountEvents.sessionId, login.session.sessionId));
      const event = events.find((entry) => entry.eventType === "branch_context_switched");

      expect(event?.eventType).toBe("branch_context_switched");
      expect(event?.detail).toContain("branch_1");
      expect(event?.detail).toContain("branch_2");
    },
    AUTHN_INTEGRATION_TIMEOUT_MS,
  );
});
