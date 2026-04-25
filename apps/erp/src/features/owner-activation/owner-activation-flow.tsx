"use client";

import Link from "next/link";
import { startTransition, useMemo, useState } from "react";

import type { OwnerActivationView } from "@vision/contracts";
import {
  AuthenticatorQrCard,
  BrandLockup,
  Button,
  InlineNotice,
  SectionHeading,
  StatusBadge,
  SurfaceCard,
  TextField,
} from "@vision/ui";

import {
  completeOwnerActivation,
  startMfaEnrollment,
  verifyMfaEnrollment,
  type StartMfaEnrollmentResult,
} from "./api";
import type { OwnerActivationPageState } from "./server";
import styles from "./owner-activation-flow.module.css";

type OwnerActivationFlowProps = {
  activationToken: string;
  apiBaseUrl: string;
  state: OwnerActivationPageState;
};

type FlowState = "password" | "mfa-enrollment" | "completed";
type ActivationStatus = "invalid" | OwnerActivationView["onboardingLinkStatus"];

function statusTone(status: ActivationStatus): "critical" | "neutral" | "warning" | "positive" {
  switch (status) {
    case "issued":
      return "positive";
    case "consumed":
      return "neutral";
    case "expired":
    case "revoked":
      return "warning";
    default:
      return "critical";
  }
}

function statusTitle(status: ActivationStatus) {
  switch (status) {
    case "issued":
      return "Invitation ready";
    case "consumed":
      return "Invitation already used";
    case "expired":
      return "Invitation expired";
    case "revoked":
      return "Invitation revoked";
    default:
      return "Invitation not found";
  }
}

function statusDescription(status: ActivationStatus) {
  switch (status) {
    case "issued":
      return "Set your password, then finish MFA to claim the owner account.";
    case "consumed":
      return "This invitation has already been used. Continue with the credentials created during activation.";
    case "expired":
      return "This invitation expired before setup was finished. Ask the platform team for a new link.";
    case "revoked":
      return "This invitation is no longer valid. A newer link may already be available.";
    default:
      return "This invitation is not valid. Ask the platform team for a new link.";
  }
}

function mapProblemCodeToStatus(code: string | undefined): ActivationStatus | null {
  switch (code) {
    case "activation_link_invalid":
      return "invalid";
    case "activation_link_expired":
      return "expired";
    case "activation_link_revoked":
      return "revoked";
    case "activation_link_consumed":
      return "consumed";
    default:
      return null;
  }
}

export function OwnerActivationFlow({
  activationToken,
  apiBaseUrl,
  state,
}: OwnerActivationFlowProps) {
  const initialStatus: ActivationStatus =
    state.kind === "invalid" ? "invalid" : state.view.onboardingLinkStatus;
  const [resolvedStatus, setResolvedStatus] = useState(initialStatus);
  const [flowState, setFlowState] = useState<FlowState>("password");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [mfaSetup, setMfaSetup] = useState<StartMfaEnrollmentResult | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

  const currentView = state.kind === "resolved" ? state.view : null;
  const canActivate = currentView?.onboardingLinkStatus === "issued" && resolvedStatus === "issued";
  const description = useMemo(
    () => statusDescription(resolvedStatus),
    [resolvedStatus],
  );

  const [challengeToken, setChallengeToken] = useState<string | null>(null);

  async function handlePasswordStep(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!currentView) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const completion = await completeOwnerActivation({
        activationToken,
        apiBaseUrl,
        payload: {
          password,
          passwordConfirmation,
        },
      });
      setChallengeToken(completion.challengeToken);
      const enrollment = await startMfaEnrollment({
        accountName: completion.owner.loginIdentifier,
        apiBaseUrl,
        challengeToken: completion.challengeToken,
      });
      setMfaSetup(enrollment);
      startTransition(() => {
        setFlowState("mfa-enrollment");
      });
    } catch (submissionError) {
      const typedError = submissionError as Error & { code?: string };
      const nextStatus = mapProblemCodeToStatus(typedError.code);

      if (nextStatus) {
        setResolvedStatus(nextStatus);
      }

      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Could not complete owner activation.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleEnrollmentStep(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!challengeToken) {
      setError("The MFA challenge could not be resumed. Start activation again.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const verified = await verifyMfaEnrollment({
        apiBaseUrl,
        challengeToken,
        code: verificationCode,
      });
      setBackupCodes(verified.backupCodes);
      startTransition(() => {
        setFlowState("completed");
        setResolvedStatus("consumed");
      });
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Could not verify MFA enrollment.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.grid}>
        <div className={styles.stack}>
          <SurfaceCard tone="accent">
            <BrandLockup logoSrc="/main_logo.svg" title="Vision" subtitle="Owner Activation" />
            <SectionHeading
              eyebrow="Owner access"
              title="Set your password and finish MFA."
              description="Use this invitation to claim the owner account."
            />
            <StatusBadge tone={statusTone(resolvedStatus)}>{statusTitle(resolvedStatus)}</StatusBadge>
            <p className={styles.copy}>{description}</p>
          </SurfaceCard>

          <SurfaceCard>
            <SectionHeading
              eyebrow="Invitation"
              title={currentView?.tenant.displayName ?? "Owner activation"}
              description="Review the tenant and contact details before continuing."
            />
            <div className={styles.detailList}>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Tenant</span>
                <span className={styles.detailValue}>
                  {currentView?.tenant.displayName ?? "Unknown tenant"}
                </span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Owner</span>
                <span className={styles.detailValue}>
                  {currentView?.owner.fullName ?? "Unknown owner"}
                </span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Masked phone</span>
                <span className={styles.detailValue}>
                  {currentView?.owner.maskedPhoneNumber ?? "Unavailable"}
                </span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Masked email</span>
                <span className={styles.detailValue}>
                  {currentView?.owner.maskedEmail ?? "Not provided"}
                </span>
              </div>
            </div>
          </SurfaceCard>
        </div>

        <SurfaceCard>
          {error ? (
            <InlineNotice tone="critical" title="We could not continue." description={error} />
          ) : null}

          {!canActivate ? (
            <InlineNotice
              tone={statusTone(resolvedStatus)}
              title={statusTitle(resolvedStatus)}
              description={description}
            />
          ) : null}

          {canActivate && flowState === "password" ? (
            <form className={styles.formStack} onSubmit={handlePasswordStep}>
              <SectionHeading
                eyebrow="Step 1"
                title="Create your owner credentials."
                description="Create the password you will use to sign in."
              />
              <TextField
                autoComplete="new-password"
                id="owner-password"
                label="New password"
                minLength={12}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Create a strong password"
                required
                type="password"
                value={password}
              />
              <TextField
                autoComplete="new-password"
                id="owner-password-confirmation"
                label="Confirm password"
                minLength={12}
                onChange={(event) => setPasswordConfirmation(event.target.value)}
                placeholder="Repeat the same password"
                required
                type="password"
                value={passwordConfirmation}
              />
              <div className={styles.actionRow}>
                <Button busy={busy} size="lg" type="submit">
                  Activate owner account
                </Button>
              </div>
            </form>
          ) : null}

          {canActivate && flowState === "mfa-enrollment" ? (
            <form className={styles.formStack} onSubmit={handleEnrollmentStep}>
              <SectionHeading
                eyebrow="Step 2"
                title="Enroll your MFA device."
                description="Add this account to your authenticator app, then enter the current code."
              />
              <AuthenticatorQrCard
                description="Scan the QR code in your authenticator app, then confirm with the current 6-digit code."
                manualEntryKey={mfaSetup?.manualEntryKey}
                otpauthUrl={mfaSetup?.otpauthUrl}
                title="Authenticator setup"
              />
              <TextField
                autoComplete="one-time-code"
                hint="Use the 6-digit code from your authenticator app"
                id="owner-mfa-code"
                label="Authenticator code"
                onChange={(event) => setVerificationCode(event.target.value)}
                pattern="[0-9]{6}"
                placeholder="123456"
                required
                value={verificationCode}
              />
              <div className={styles.actionRow}>
                <Button busy={busy} size="lg" type="submit">
                  Verify MFA and finish
                </Button>
              </div>
            </form>
          ) : null}

          {flowState === "completed" ? (
            <div className={styles.formStack}>
              <SectionHeading
                eyebrow="Completed"
                title="Your owner account is active."
                description="Setup is complete. Keep your backup codes in a safe place."
              />
              <InlineNotice
                tone="positive"
                title="Backup codes"
                description="Use these one-time backup codes if your authenticator device is unavailable."
              />
              <div className={styles.codes}>
                {backupCodes.map((code) => (
                  <span key={code} className={styles.code}>
                    {code}
                  </span>
                ))}
              </div>
              <p className={styles.copy}>
                <Link className="app-text-link" href="/">
                  Continue to the ERP surface
                </Link>
              </p>
            </div>
          ) : null}
        </SurfaceCard>
      </div>
    </main>
  );
}
