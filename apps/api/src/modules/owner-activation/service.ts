import { randomUUID } from "node:crypto";

import {
  createChallengeToken,
  hashPassword,
  normalizeLoginIdentifier,
} from "@vision/authn";
import {
  type OwnerActivationCompletionResult,
  type OwnerActivationView,
} from "@vision/contracts";
import { type VisionDatabase } from "@vision/db";

import {
  deriveOnboardingLinkStatus,
  hashOnboardingActivationToken,
  maskEmail,
  maskPhoneNumber,
} from "../platform-provisioning/onboarding-links";
import { OwnerActivationError } from "./errors";
import {
  createOwnerActivationRepository,
  type OwnerActivationRepository,
} from "./repository";

const DEFAULT_MFA_CHALLENGE_TTL_MS = 10 * 60 * 1000;

type OwnerActivationServiceOptions = {
  db: VisionDatabase;
  now?: () => Date;
  mfaChallengeTtlMs?: number;
  repository?: OwnerActivationRepository;
};

function mapActivationView(
  record: Awaited<
    ReturnType<OwnerActivationRepository["getActivationRecordByTokenHash"]>
  > extends infer T
    ? NonNullable<T>
    : never,
  referenceTime: Date,
): OwnerActivationView {
  const onboardingLinkStatus = deriveOnboardingLinkStatus(
    record.onboardingLink,
    referenceTime,
  );

  if (!onboardingLinkStatus) {
    throw new OwnerActivationError("activation_link_invalid");
  }

  return {
    onboardingLinkStatus,
    expiresAt: record.onboardingLink.expiresAt.toISOString(),
    tenant: {
      displayName: record.tenant.displayName,
      slug: record.tenant.slug,
    },
    owner: {
      fullName: record.owner.fullName,
      maskedPhoneNumber: maskPhoneNumber(record.owner.phoneNumber),
      maskedEmail: maskEmail(record.owner.email ?? null),
    },
  };
}

function mapStatusToError(status: OwnerActivationView["onboardingLinkStatus"]) {
  switch (status) {
    case "expired":
      return new OwnerActivationError("activation_link_expired");
    case "revoked":
      return new OwnerActivationError("activation_link_revoked");
    case "consumed":
      return new OwnerActivationError("activation_link_consumed");
    default:
      return new OwnerActivationError("activation_link_invalid");
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

export function createOwnerActivationService(options: OwnerActivationServiceOptions) {
  const now = options.now ?? (() => new Date());
  const mfaChallengeTtlMs = options.mfaChallengeTtlMs ?? DEFAULT_MFA_CHALLENGE_TTL_MS;
  const repository = options.repository ?? createOwnerActivationRepository(options.db);

  return {
    async validateActivationToken(input: {
      activationToken: string;
    }): Promise<OwnerActivationView> {
      const record = await repository.getActivationRecordByTokenHash(
        hashOnboardingActivationToken(input.activationToken),
      );

      if (!record) {
        throw new OwnerActivationError("activation_link_invalid");
      }

      return mapActivationView(record, now());
    },

    async completeActivation(input: {
      activationToken: string;
      password: string;
      passwordConfirmation: string;
    }): Promise<OwnerActivationCompletionResult> {
      const currentTime = now();
      const record = await repository.getActivationRecordByTokenHash(
        hashOnboardingActivationToken(input.activationToken),
      );

      if (!record) {
        throw new OwnerActivationError("activation_link_invalid");
      }

      const view = mapActivationView(record, currentTime);
      if (view.onboardingLinkStatus !== "issued") {
        throw mapStatusToError(view.onboardingLinkStatus);
      }

      const normalizedLoginIdentifier = normalizeLoginIdentifier(record.owner.phoneNumber);
      const existingSubject =
        await repository.findInternalSubjectByNormalizedLoginIdentifier(
          normalizedLoginIdentifier,
        );

      if (existingSubject) {
        throw new OwnerActivationError("activation_subject_conflict");
      }

      const passwordHash = await hashPassword(input.password);
      const subjectId = `sub_${randomUUID()}`;
      const challenge = createChallengeToken();
      const expiresAt = new Date(currentTime.getTime() + mfaChallengeTtlMs);

      try {
        return await repository.transaction(async (txRepository) => {
          await txRepository.insertAuthSubject({
            id: subjectId,
            subjectType: "internal",
            loginIdentifier: record.owner.phoneNumber,
            normalizedLoginIdentifier,
            passwordHash,
            internalSensitivity: "tenant_owner",
            passwordUpdatedAt: currentTime,
            createdAt: currentTime,
            updatedAt: currentTime,
          });
          await txRepository.insertAuthAssuranceChallenge({
            id: challenge.challengeId,
            subjectId,
            sessionId: null,
            requiredAssurance: "mfa_verified",
            reason: "mfa_enrollment",
            secretHash: challenge.secretHash,
            expiresAt,
            createdAt: currentTime,
            updatedAt: currentTime,
          });
          await txRepository.updateOwner(record.owner.id, {
            authSubjectId: subjectId,
            status: "activated",
            activatedAt: currentTime,
            updatedAt: currentTime,
          });
          await txRepository.updateOnboardingLink(record.onboardingLink.id, {
            consumedAt: currentTime,
          });
          await txRepository.insertLifecycleEvent({
            id: `tle_${randomUUID()}`,
            tenantId: record.tenant.id,
            actorType: "tenant_owner",
            actorSubjectId: subjectId,
            eventType: "owner_activated",
            detail: {
              tenantOwnerId: record.owner.id,
            },
            occurredAt: currentTime,
            createdAt: currentTime,
          });
          await txRepository.insertAuthAccountEvent({
            id: `evt_${randomUUID()}`,
            subjectId,
            sessionId: null,
            subjectType: "internal",
            eventType: "mfa_challenge_created",
            loginIdentifier: record.owner.phoneNumber,
            detail: "mfa_enrollment",
            occurredAt: currentTime,
            createdAt: currentTime,
          });

          return {
            subjectId,
            challengeId: challenge.challengeId,
            challengeToken: challenge.token,
            requiredAssurance: "mfa_verified" as const,
            nextStep: "mfa_enrollment_required" as const,
            reason: "mfa_enrollment" as const,
            expiresAt: expiresAt.toISOString(),
            tenant: {
              displayName: record.tenant.displayName,
              slug: record.tenant.slug,
            },
            owner: {
              fullName: record.owner.fullName,
              loginIdentifier: record.owner.phoneNumber,
            },
          };
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new OwnerActivationError("activation_subject_conflict");
        }

        throw error;
      }
    },
  };
}

export type OwnerActivationService = ReturnType<typeof createOwnerActivationService>;
