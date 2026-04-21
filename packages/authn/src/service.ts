import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import {
  authAccountEvents,
  authSessions,
  authSubjects,
  type VisionDatabase,
} from "@vision/db";

import { AuthnError } from "./errors";
import { verifyPassword } from "./password";
import {
  createSessionToken,
  parseSessionToken,
  verifySessionSecret,
} from "./session-token";

export type AuthSubjectType = "customer" | "internal";
export type AuthAssuranceLevel = "basic";

export type AuthSubjectSummary = {
  id: string;
  subjectType: AuthSubjectType;
  loginIdentifier: string;
};

export type AuthSessionSummary = {
  sessionId: string;
  subjectId: string;
  subjectType: AuthSubjectType;
  assuranceLevel: AuthAssuranceLevel;
  activeTenantId: string | null;
  activeBranchId: string | null;
  expiresAt: Date;
};

export type AuthResolution = {
  subject: AuthSubjectSummary;
  session: AuthSessionSummary;
};

export type AuthnServiceOptions = {
  now?: () => Date;
  sessionTtlMs?: number;
};

export function normalizeLoginIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

async function loadSubjectById(
  db: VisionDatabase,
  subjectId: string,
): Promise<AuthSubjectSummary> {
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
  };
}

export function createAuthnService(
  db: VisionDatabase,
  options: AuthnServiceOptions = {},
) {
  const now = options.now ?? (() => new Date());
  const sessionTtlMs = options.sessionTtlMs ?? 1000 * 60 * 60 * 12;

  async function writeEvent(input: {
    subjectType: AuthSubjectType;
    eventType:
      | "login_success"
      | "login_failure"
      | "logout"
      | "session_revoked"
      | "session_rotated";
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

  async function loadResolution(sessionId: string): Promise<AuthResolution> {
    const [session] = await db
      .select()
      .from(authSessions)
      .where(eq(authSessions.id, sessionId))
      .limit(1);

    if (!session) {
      throw new AuthnError("missing_session");
    }

    const subject = await loadSubjectById(db, session.subjectId);

    return {
      subject,
      session: {
        sessionId: session.id,
        subjectId: session.subjectId,
        subjectType: session.subjectType,
        assuranceLevel: session.assuranceLevel,
        activeTenantId: session.activeTenantId ?? null,
        activeBranchId: session.activeBranchId ?? null,
        expiresAt: session.expiresAt,
      },
    };
  }

  return {
    async login(input: {
      subjectType: AuthSubjectType;
      loginIdentifier: string;
      password: string;
    }) {
      const normalizedLoginIdentifier = normalizeLoginIdentifier(
        input.loginIdentifier,
      );
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
          loginIdentifier: input.loginIdentifier,
          subjectId: subject?.id ?? null,
          detail: "invalid_credentials",
        });

        throw new AuthnError("invalid_credentials");
      }

      if (!subject.isEnabled) {
        throw new AuthnError("disabled_subject");
      }

      const created = createSessionToken();
      const issuedAt = now();
      const expiresAt = new Date(issuedAt.getTime() + sessionTtlMs);

      await db.insert(authSessions).values({
        id: created.sessionId,
        subjectId: subject.id,
        subjectType: subject.subjectType,
        secretHash: created.secretHash,
        assuranceLevel: "basic",
        issuedAt,
        expiresAt,
        lastRotatedAt: issuedAt,
      });

      await writeEvent({
        subjectType: subject.subjectType,
        eventType: "login_success",
        subjectId: subject.id,
        sessionId: created.sessionId,
        loginIdentifier: subject.loginIdentifier,
      });

      const resolution = await loadResolution(created.sessionId);

      return {
        ...resolution,
        sessionToken: created.token,
      };
    },

    async resolveSession(input: { token: string }) {
      const session = await getStoredSession(input.token);

      return loadResolution(session.id);
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
        ...(await loadResolution(resolution.session.sessionId)),
        sessionToken: `${resolution.session.sessionId}.${nextToken.secret}`,
      };
    },
  };
}

export type AuthnService = ReturnType<typeof createAuthnService>;
