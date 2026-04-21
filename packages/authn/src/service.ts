import { randomUUID } from "node:crypto";

import { and, eq, inArray, isNull } from "drizzle-orm";

import {
  authAccountEvents,
  authAssuranceChallenges,
  authMfaBackupCodes,
  authMfaTotpFactors,
  authSessions,
  authSubjects,
  type VisionDatabase,
} from "@vision/db";

import {
  resolveAssuranceFailure,
  type AuthAssuranceLevel,
} from "./assurance";
import { AuthnError } from "./errors";
import {
  createChallengeToken,
  createTotpProvisioning,
  decryptTotpSecret,
  encryptTotpSecret,
  generateBackupCodes,
  generateTotpSecret,
  parseChallengeToken,
  verifyBackupCodeHash,
  verifyChallengeSecret,
  verifyTotpCode,
} from "./mfa";
import { verifyPassword } from "./password";
import {
  createSessionToken,
  parseSessionToken,
  verifySessionSecret,
} from "./session-token";

export type AuthSubjectType = "customer" | "internal";
export type AuthInternalSensitivity =
  | "none"
  | "platform_admin"
  | "tenant_owner"
  | "branch_manager";
export type AuthAssuranceChallengeReason =
  | "login_mfa"
  | "mfa_enrollment"
  | "tenant_context_switch"
  | "support_grant_activation"
  | "website_management_write"
  | "data_export"
  | "credential_reset";

export type AuthSubjectSummary = {
  id: string;
  subjectType: AuthSubjectType;
  loginIdentifier: string;
  internalSensitivity: AuthInternalSensitivity | null;
};

export type AuthSessionSummary = {
  sessionId: string;
  subjectId: string;
  subjectType: AuthSubjectType;
  assuranceLevel: AuthAssuranceLevel;
  assuranceUpdatedAt: Date;
  activeTenantId: string | null;
  activeBranchId: string | null;
  expiresAt: Date;
};

export type AuthResolution = {
  subject: AuthSubjectSummary;
  session: AuthSessionSummary;
};

export type AuthPendingChallengeResult = {
  kind: "mfa_challenge";
  challengeId: string;
  challengeToken: string;
  requiredAssurance: "mfa_verified";
  nextStep: "mfa_enrollment_required" | "mfa_verification_required";
  reason: "login_mfa" | "mfa_enrollment";
  expiresAt: Date;
};

export type AuthSessionResult = AuthResolution & {
  kind: "session";
  sessionToken: string;
};

export type AuthEnrollmentResult = AuthSessionResult & {
  backupCodes: string[];
};

export type AuthnServiceOptions = {
  now?: () => Date;
  sessionTtlMs?: number;
  mfaEncryptionKey: string;
  mfaEncryptionKeyVersion: string;
  totpIssuer?: string;
};

function normalizeLoginIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

export function createAuthnService(
  db: VisionDatabase,
  options: AuthnServiceOptions,
) {
  const now = options.now ?? (() => new Date());
  const sessionTtlMs = options.sessionTtlMs ?? 1000 * 60 * 60 * 12;
  const totpIssuer = options.totpIssuer ?? "Vision";

  async function writeEvent(input: {
    subjectType: AuthSubjectType;
    eventType:
      | "login_success"
      | "login_failure"
      | "logout"
      | "session_revoked"
      | "session_rotated"
      | "mfa_enrollment_started"
      | "mfa_enrollment_completed"
      | "mfa_challenge_created"
      | "mfa_challenge_failed"
      | "mfa_verified"
      | "backup_code_used"
      | "backup_codes_regenerated"
      | "step_up_started"
      | "step_up_verified"
      | "assurance_denied";
    subjectId?: string | null;
    sessionId?: string | null;
    loginIdentifier?: string | null;
    detail?: string | null;
  }) {
    await db.insert(authAccountEvents).values({
      id: `evt_${randomUUID()}`,
      subjectId: input.subjectId ?? null,
      sessionId: input.sessionId ?? null,
      subjectType: input.subjectType,
      eventType: input.eventType,
      loginIdentifier: input.loginIdentifier ?? null,
      detail: input.detail ?? null,
      occurredAt: now(),
    });
  }

  async function loadSubjectById(subjectId: string): Promise<AuthSubjectSummary> {
    const [subject] = await db
      .select()
      .from(authSubjects)
      .where(and(eq(authSubjects.id, subjectId), eq(authSubjects.isEnabled, true)))
      .limit(1);

    if (!subject) {
      throw new AuthnError("missing_session");
    }

    return {
      id: subject.id,
      subjectType: subject.subjectType,
      loginIdentifier: subject.loginIdentifier,
      internalSensitivity: subject.internalSensitivity ?? null,
    };
  }

  async function loadResolution(sessionId: string): Promise<AuthResolution> {
    const [session] = await db
      .select()
      .from(authSessions)
      .where(eq(authSessions.id, sessionId))
      .limit(1);

    if (!session) {
      throw new AuthnError("missing_session");
    }

    return {
      subject: await loadSubjectById(session.subjectId),
      session: {
        sessionId: session.id,
        subjectId: session.subjectId,
        subjectType: session.subjectType,
        assuranceLevel: session.assuranceLevel,
        assuranceUpdatedAt: session.assuranceUpdatedAt,
        activeTenantId: session.activeTenantId ?? null,
        activeBranchId: session.activeBranchId ?? null,
        expiresAt: session.expiresAt,
      },
    };
  }

  async function getStoredSession(token: string) {
    let parsedToken: ReturnType<typeof parseSessionToken>;

    try {
      parsedToken = parseSessionToken(token);
    } catch {
      throw new AuthnError("invalid_session_token");
    }

    const [session] = await db
      .select()
      .from(authSessions)
      .where(eq(authSessions.id, parsedToken.sessionId))
      .limit(1);

    if (!session) {
      throw new AuthnError("missing_session");
    }

    if (!verifySessionSecret(session.secretHash, parsedToken.secret)) {
      throw new AuthnError("invalid_session_token");
    }

    if (session.revokedAt) {
      throw new AuthnError("revoked_session");
    }

    if (session.expiresAt.getTime() <= now().getTime()) {
      throw new AuthnError("expired_session");
    }

    return session;
  }

  async function createSession(input: {
    subjectId: string;
    subjectType: AuthSubjectType;
    assuranceLevel: AuthAssuranceLevel;
  }): Promise<AuthSessionResult> {
    const created = createSessionToken();
    const issuedAt = now();
    const expiresAt = new Date(issuedAt.getTime() + sessionTtlMs);

    await db.insert(authSessions).values({
      id: created.sessionId,
      subjectId: input.subjectId,
      subjectType: input.subjectType,
      secretHash: created.secretHash,
      assuranceLevel: input.assuranceLevel,
      assuranceUpdatedAt: issuedAt,
      issuedAt,
      expiresAt,
      lastRotatedAt: issuedAt,
    });

    return {
      kind: "session",
      ...(await loadResolution(created.sessionId)),
      sessionToken: created.token,
    };
  }

  async function createChallenge(input: {
    subjectId: string;
    subjectType: AuthSubjectType;
    sessionId?: string;
    requiredAssurance: "mfa_verified" | "step_up_verified";
    reason: AuthAssuranceChallengeReason;
  }) {
    const created = createChallengeToken();
    const expiresAt = new Date(now().getTime() + 10 * 60 * 1000);

    await db.insert(authAssuranceChallenges).values({
      id: created.challengeId,
      subjectId: input.subjectId,
      sessionId: input.sessionId ?? null,
      requiredAssurance: input.requiredAssurance,
      reason: input.reason,
      secretHash: created.secretHash,
      expiresAt,
    });

    await writeEvent({
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      sessionId: input.sessionId ?? null,
      eventType: "mfa_challenge_created",
      detail: input.reason,
    });

    return {
      challengeId: created.challengeId,
      challengeToken: created.token,
      expiresAt,
    };
  }

  async function requireActiveChallenge(challengeToken: string) {
    let parsed;

    try {
      parsed = parseChallengeToken(challengeToken);
    } catch {
      throw new AuthnError("invalid_assurance_challenge");
    }

    const [challenge] = await db
      .select()
      .from(authAssuranceChallenges)
      .where(eq(authAssuranceChallenges.id, parsed.challengeId))
      .limit(1);

    if (!challenge || !verifyChallengeSecret(challenge.secretHash, parsed.secret)) {
      throw new AuthnError("invalid_assurance_challenge");
    }

    if (challenge.invalidatedAt || challenge.consumedAt) {
      throw new AuthnError("consumed_assurance_challenge");
    }

    if (challenge.expiresAt.getTime() <= now().getTime()) {
      throw new AuthnError("expired_assurance_challenge");
    }

    return challenge;
  }

  async function consumeChallenge(challengeId: string) {
    await db
      .update(authAssuranceChallenges)
      .set({
        consumedAt: now(),
        completedAt: now(),
        updatedAt: now(),
      })
      .where(eq(authAssuranceChallenges.id, challengeId));
  }

  async function verifyChallengeMaterial(input: {
    challenge: Awaited<ReturnType<typeof requireActiveChallenge>>;
    totpCode?: string;
    backupCode?: string;
    verificationTime: Date;
  }) {
    const [factor] = await db
      .select()
      .from(authMfaTotpFactors)
      .where(
        and(
          eq(authMfaTotpFactors.subjectId, input.challenge.subjectId),
          isNull(authMfaTotpFactors.disabledAt),
        ),
      )
      .limit(1);

    let verified = false;

    if (factor && input.totpCode) {
      const decrypted = decryptTotpSecret(factor.encryptedSecret, options.mfaEncryptionKey);
      verified = verifyTotpCode(decrypted, input.totpCode, input.verificationTime);

      if (verified) {
        await db
          .update(authMfaTotpFactors)
          .set({
            lastUsedAt: input.verificationTime,
            updatedAt: input.verificationTime,
          })
          .where(eq(authMfaTotpFactors.id, factor.id));
      }
    }

    if (!verified && input.backupCode) {
      const codes = await db
        .select()
        .from(authMfaBackupCodes)
        .where(
          and(
            eq(authMfaBackupCodes.subjectId, input.challenge.subjectId),
            isNull(authMfaBackupCodes.usedAt),
          ),
        );
      const matched = codes.find((code) =>
        verifyBackupCodeHash(code.codeHash, input.backupCode as string),
      );

      if (matched) {
        await db
          .update(authMfaBackupCodes)
          .set({
            usedAt: input.verificationTime,
          })
          .where(eq(authMfaBackupCodes.id, matched.id));
        await writeEvent({
          subjectType: "internal",
          subjectId: input.challenge.subjectId,
          eventType: "backup_code_used",
        });
        verified = true;
      }
    }

    if (!verified) {
      await writeEvent({
        subjectType: "internal",
        subjectId: input.challenge.subjectId,
        eventType: "mfa_challenge_failed",
        detail: input.backupCode ? "invalid_backup_code" : "invalid_totp_code",
      });
      throw new AuthnError(input.backupCode ? "invalid_backup_code" : "invalid_totp_code");
    }
  }

  return {
    async login(input: {
      subjectType: AuthSubjectType;
      loginIdentifier: string;
      password: string;
    }): Promise<AuthPendingChallengeResult | AuthSessionResult> {
      const normalizedLoginIdentifier = normalizeLoginIdentifier(input.loginIdentifier);
      const [subject] = await db
        .select()
        .from(authSubjects)
        .where(
          and(
            eq(authSubjects.subjectType, input.subjectType),
            eq(authSubjects.normalizedLoginIdentifier, normalizedLoginIdentifier),
          ),
        )
        .limit(1);

      if (!subject || !(await verifyPassword(subject.passwordHash, input.password))) {
        await writeEvent({
          subjectType: input.subjectType,
          eventType: "login_failure",
          subjectId: subject?.id ?? null,
          loginIdentifier: input.loginIdentifier,
          detail: "invalid_credentials",
        });
        throw new AuthnError("invalid_credentials");
      }

      if (!subject.isEnabled) {
        throw new AuthnError("disabled_subject");
      }

      const sensitivity = subject.internalSensitivity ?? null;

      if (subject.subjectType === "internal" && sensitivity && sensitivity !== "none") {
        const [factor] = await db
          .select()
          .from(authMfaTotpFactors)
          .where(
            and(
              eq(authMfaTotpFactors.subjectId, subject.id),
              isNull(authMfaTotpFactors.disabledAt),
            ),
          )
          .limit(1);
        const reason = factor?.verifiedAt ? "login_mfa" : "mfa_enrollment";
        const challenge = await createChallenge({
          subjectId: subject.id,
          subjectType: subject.subjectType,
          requiredAssurance: "mfa_verified",
          reason,
        });

        return {
          kind: "mfa_challenge",
          challengeId: challenge.challengeId,
          challengeToken: challenge.challengeToken,
          requiredAssurance: "mfa_verified",
          nextStep: factor?.verifiedAt
            ? "mfa_verification_required"
            : "mfa_enrollment_required",
          reason,
          expiresAt: challenge.expiresAt,
        };
      }

      const session = await createSession({
        subjectId: subject.id,
        subjectType: subject.subjectType,
        assuranceLevel: "basic",
      });

      await writeEvent({
        subjectType: subject.subjectType,
        subjectId: subject.id,
        sessionId: session.session.sessionId,
        eventType: "login_success",
        loginIdentifier: subject.loginIdentifier,
      });

      return session;
    },

    async resolveSession(input: { token: string }) {
      const session = await getStoredSession(input.token);

      return loadResolution(session.id);
    },

    async startMfaEnrollment(input: { challengeToken: string; accountName: string }) {
      const challenge = await requireActiveChallenge(input.challengeToken);
      const manualEntryKey = generateTotpSecret();
      const encryptedSecret = encryptTotpSecret(manualEntryKey, options.mfaEncryptionKey);

      await db
        .insert(authMfaTotpFactors)
        .values({
          id: `totp_${randomUUID()}`,
          subjectId: challenge.subjectId,
          encryptedSecret,
          encryptionKeyVersion: options.mfaEncryptionKeyVersion,
        });

      await writeEvent({
        subjectType: "internal",
        subjectId: challenge.subjectId,
        eventType: "mfa_enrollment_started",
      });

      return createTotpProvisioning({
        issuer: totpIssuer,
        accountName: input.accountName,
        manualEntryKey,
      });
    },

    async verifyMfaEnrollment(input: {
      challengeToken: string;
      code: string;
      now?: Date;
    }): Promise<AuthEnrollmentResult> {
      const challenge = await requireActiveChallenge(input.challengeToken);
      const [factor] = await db
        .select()
        .from(authMfaTotpFactors)
        .where(
          and(
            eq(authMfaTotpFactors.subjectId, challenge.subjectId),
            isNull(authMfaTotpFactors.disabledAt),
          ),
        )
        .limit(1);

      if (!factor) {
        throw new AuthnError("invalid_totp_code");
      }

      const decrypted = decryptTotpSecret(factor.encryptedSecret, options.mfaEncryptionKey);
      const verificationTime = input.now ?? now();

      if (!verifyTotpCode(decrypted, input.code, verificationTime)) {
        await writeEvent({
          subjectType: "internal",
          subjectId: challenge.subjectId,
          eventType: "mfa_challenge_failed",
          detail: "invalid_totp_code",
        });
        throw new AuthnError("invalid_totp_code");
      }

      await db
        .update(authMfaTotpFactors)
        .set({
          verifiedAt: verificationTime,
          lastUsedAt: verificationTime,
          updatedAt: verificationTime,
        })
        .where(eq(authMfaTotpFactors.id, factor.id));

      const batchId = `bkp_${randomUUID()}`;
      const backupCodes = generateBackupCodes();
      await db.insert(authMfaBackupCodes).values(
        backupCodes.map((code, index) => ({
          id: `bkc_${randomUUID()}`,
          subjectId: challenge.subjectId,
          batchId,
          codeHash: code.hash,
          ordinal: index,
        })),
      );

      await consumeChallenge(challenge.id);

      const session = await createSession({
        subjectId: challenge.subjectId,
        subjectType: "internal",
        assuranceLevel: "mfa_verified",
      });

      await writeEvent({
        subjectType: "internal",
        subjectId: challenge.subjectId,
        sessionId: session.session.sessionId,
        eventType: "mfa_enrollment_completed",
      });

      return {
        ...session,
        backupCodes: backupCodes.map((code) => code.plainText.replace("-", "")),
      };
    },

    async verifyMfaChallenge(input: {
      challengeToken: string;
      totpCode?: string;
      backupCode?: string;
      now?: Date;
    }): Promise<AuthSessionResult> {
      const challenge = await requireActiveChallenge(input.challengeToken);
      await verifyChallengeMaterial({
        challenge,
        totpCode: input.totpCode,
        backupCode: input.backupCode,
        verificationTime: input.now ?? now(),
      });

      await consumeChallenge(challenge.id);

      const session = await createSession({
        subjectId: challenge.subjectId,
        subjectType: "internal",
        assuranceLevel: "mfa_verified",
      });

      await writeEvent({
        subjectType: "internal",
        subjectId: challenge.subjectId,
        sessionId: session.session.sessionId,
        eventType: "mfa_verified",
      });

      return session;
    },

    async startStepUpChallenge(input: {
      token: string;
      reason: Exclude<AuthAssuranceChallengeReason, "login_mfa" | "mfa_enrollment">;
    }) {
      const resolution = await this.requireAssurance({
        token: input.token,
        requiredAssurance: "mfa_verified",
        reason: input.reason,
      });
      const challenge = await createChallenge({
        subjectId: resolution.subject.id,
        subjectType: resolution.subject.subjectType,
        sessionId: resolution.session.sessionId,
        requiredAssurance: "step_up_verified",
        reason: input.reason,
      });

      await writeEvent({
        subjectType: resolution.subject.subjectType,
        subjectId: resolution.subject.id,
        sessionId: resolution.session.sessionId,
        eventType: "step_up_started",
        detail: input.reason,
      });

      return challenge;
    },

    async verifyStepUpChallenge(input: {
      token: string;
      challengeToken: string;
      totpCode?: string;
      backupCode?: string;
      now?: Date;
    }): Promise<AuthSessionResult> {
      const resolution = await this.resolveSession({ token: input.token });
      const challenge = await requireActiveChallenge(input.challengeToken);

      if (challenge.sessionId !== resolution.session.sessionId) {
        throw new AuthnError("invalid_assurance_challenge");
      }

      await verifyChallengeMaterial({
        challenge,
        totpCode: input.totpCode,
        backupCode: input.backupCode,
        verificationTime: input.now ?? now(),
      });
      await consumeChallenge(challenge.id);

      await db
        .update(authSessions)
        .set({
          assuranceLevel: "step_up_verified",
          assuranceUpdatedAt: input.now ?? now(),
          updatedAt: input.now ?? now(),
        })
        .where(eq(authSessions.id, resolution.session.sessionId));

      await writeEvent({
        subjectType: resolution.subject.subjectType,
        subjectId: resolution.subject.id,
        sessionId: resolution.session.sessionId,
        eventType: "step_up_verified",
        detail: challenge.reason,
      });

      return {
        kind: "session",
        ...(await loadResolution(resolution.session.sessionId)),
        sessionToken: input.token,
      };
    },

    async regenerateBackupCodes(input: { token: string }) {
      const resolution = await this.requireAssurance({
        token: input.token,
        requiredAssurance: "step_up_verified",
        reason: "credential_reset",
      });
      const unusedCodes = await db
        .select()
        .from(authMfaBackupCodes)
        .where(
          and(
            eq(authMfaBackupCodes.subjectId, resolution.subject.id),
            isNull(authMfaBackupCodes.usedAt),
          ),
        );

      if (unusedCodes.length > 0) {
        await db
          .update(authMfaBackupCodes)
          .set({ usedAt: now() })
          .where(inArray(authMfaBackupCodes.id, unusedCodes.map((code) => code.id)));
      }

      const batchId = `bkp_${randomUUID()}`;
      const backupCodes = generateBackupCodes();
      await db.insert(authMfaBackupCodes).values(
        backupCodes.map((code, index) => ({
          id: `bkc_${randomUUID()}`,
          subjectId: resolution.subject.id,
          batchId,
          codeHash: code.hash,
          ordinal: index,
        })),
      );

      await writeEvent({
        subjectType: resolution.subject.subjectType,
        subjectId: resolution.subject.id,
        sessionId: resolution.session.sessionId,
        eventType: "backup_codes_regenerated",
      });

      return backupCodes.map((code) => code.plainText.replace("-", ""));
    },

    async requireAssurance(input: {
      token: string;
      requiredAssurance: AuthAssuranceLevel;
      reason: string;
      now?: Date;
      maxAgeMs?: number;
    }) {
      const resolution = await this.resolveSession({ token: input.token });
      const denial = resolveAssuranceFailure({
        currentAssurance: resolution.session.assuranceLevel,
        requiredAssurance: input.requiredAssurance,
        assuranceUpdatedAt: resolution.session.assuranceUpdatedAt,
        now: input.now ?? now(),
        maxAgeMs: input.maxAgeMs,
      });

      if (denial) {
        await writeEvent({
          subjectType: resolution.subject.subjectType,
          subjectId: resolution.subject.id,
          sessionId: resolution.session.sessionId,
          eventType: "assurance_denied",
          detail: input.reason,
        });
        throw new AuthnError("insufficient_assurance", undefined, {
          requiredAssurance: input.requiredAssurance,
          denialReason: denial,
        });
      }

      return resolution;
    },

    async revokeSession(input: {
      sessionId: string;
      subjectType: AuthSubjectType;
      reason: string;
    }) {
      await db
        .update(authSessions)
        .set({
          revokedAt: now(),
          revocationReason: input.reason,
          updatedAt: now(),
        })
        .where(eq(authSessions.id, input.sessionId));

      await writeEvent({
        subjectType: input.subjectType,
        eventType: "session_revoked",
        sessionId: input.sessionId,
        detail: input.reason,
      });
    },

    async logout(input: { token: string }) {
      const resolution = await this.resolveSession(input);

      await this.revokeSession({
        sessionId: resolution.session.sessionId,
        subjectType: resolution.subject.subjectType,
        reason: "logout",
      });

      await writeEvent({
        subjectType: resolution.subject.subjectType,
        eventType: "logout",
        subjectId: resolution.subject.id,
        sessionId: resolution.session.sessionId,
        loginIdentifier: resolution.subject.loginIdentifier,
      });
    },

    async rotateSession(input: { token: string }) {
      const resolution = await this.resolveSession(input);
      const nextToken = createSessionToken();

      await db
        .update(authSessions)
        .set({
          secretHash: nextToken.secretHash,
          lastRotatedAt: now(),
          updatedAt: now(),
        })
        .where(eq(authSessions.id, resolution.session.sessionId));

      await writeEvent({
        subjectType: resolution.subject.subjectType,
        eventType: "session_rotated",
        subjectId: resolution.subject.id,
        sessionId: resolution.session.sessionId,
      });

      return {
        kind: "session",
        ...(await loadResolution(resolution.session.sessionId)),
        sessionToken: `${resolution.session.sessionId}.${nextToken.secret}`,
      };
    },
  };
}

export type AuthnService = ReturnType<typeof createAuthnService>;
export { normalizeLoginIdentifier };
