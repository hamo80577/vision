"use client";

import { useEffect, useState } from "react";

import {
  AuthenticatorQrCard,
  Button,
  InlineNotice,
  LoadingSkeleton,
  TextField,
} from "@vision/ui";

import {
  clearPlatformMfaSession,
  readPlatformMfaSession,
  updatePlatformMfaEnrollment,
} from "./mfa-session";
import { PlatformAuthShell } from "./platform-auth-shell";
import { PlatformCodeField } from "./platform-code-field";
import {
  startMfaEnrollment,
  verifyMfaChallenge,
  verifyMfaEnrollment,
  type MfaEnrollmentStartResult,
} from "./api";
import styles from "./platform-auth.module.css";

type PlatformMfaFlowProps = {
  apiBaseUrl: string;
};

type ChallengeState = {
  challengeToken: string;
  enrollment: MfaEnrollmentStartResult | null;
  loginIdentifier: string;
  nextStep: "mfa_enrollment_required" | "mfa_verification_required";
};

export function PlatformMfaFlow({ apiBaseUrl }: PlatformMfaFlowProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<ChallengeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [verificationCode, setVerificationCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function prepareChallenge() {
      const stored = readPlatformMfaSession();

      if (!stored) {
        setLoading(false);
        return;
      }

      if (stored.nextStep === "mfa_verification_required") {
        setChallenge(stored);
        setLoading(false);
        return;
      }

      if (stored.enrollment) {
        setChallenge(stored);
        setLoading(false);
        return;
      }

      try {
        const enrollment = await startMfaEnrollment({
          accountName: stored.loginIdentifier,
          apiBaseUrl,
          challengeToken: stored.challengeToken,
        });

        if (cancelled) {
          return;
        }

        updatePlatformMfaEnrollment(enrollment);
        setChallenge({
          ...stored,
          enrollment,
        });
      } catch (submissionError) {
        if (cancelled) {
          return;
        }

        setError(
          submissionError instanceof Error
            ? submissionError.message
            : "Could not prepare MFA verification.",
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void prepareChallenge();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl]);

  async function handleVerify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!challenge) {
      setError("Sign in again to continue.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      if (challenge.nextStep === "mfa_enrollment_required") {
        await verifyMfaEnrollment({
          apiBaseUrl,
          challengeToken: challenge.challengeToken,
          code: verificationCode,
        });
      } else {
        await verifyMfaChallenge({
          apiBaseUrl,
          backupCode: useBackupCode ? backupCode : undefined,
          challengeToken: challenge.challengeToken,
          code: useBackupCode ? undefined : verificationCode,
        });
      }

      clearPlatformMfaSession();
      window.location.assign("/");
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Could not verify MFA.",
      );
    } finally {
      setBusy(false);
    }
  }

  function handleStartOver() {
    clearPlatformMfaSession();
    window.location.assign("/login");
  }

  const isEnrollment = challenge?.nextStep === "mfa_enrollment_required";

  return (
    <PlatformAuthShell
      footerNote="Secure verification required"
      subtitle={
        isEnrollment
          ? "Finish MFA setup to continue."
          : "Verify your second factor to continue."
      }
      title={isEnrollment ? "Set up MFA" : "Verify MFA"}
    >
      <div className={styles.stack}>
        {error ? (
          <InlineNotice tone="critical" title="Verification failed" description={error} />
        ) : null}

        {!loading && !challenge ? (
          <>
            <InlineNotice
              tone="warning"
              title="No active MFA challenge"
              description="Sign in again to continue with platform access."
            />
            <Button onClick={handleStartOver} size="lg" type="button">
              Back to sign in
            </Button>
          </>
        ) : null}

        {loading ? (
          <div className={styles.loadingStack}>
            <div className={styles.assuranceStrip}>
              <LoadingSkeleton rows={2} />
            </div>
            <LoadingSkeleton rows={3} />
          </div>
        ) : null}

        {challenge ? (
          <>
            <div className={styles.assuranceStrip}>
              <div className={styles.assuranceCard}>
                <span className={styles.assuranceLabel}>Current session</span>
                <span className={styles.assuranceValue}>Basic</span>
              </div>
              <span aria-hidden="true" className={styles.assuranceArrow}>
                →
              </span>
              <div className={styles.assuranceCard}>
                <span className={styles.assuranceLabel}>Target assurance</span>
                <span className={styles.assuranceValue}>MFA verified</span>
              </div>
            </div>

            <form className={styles.formStack} onSubmit={handleVerify}>
              {isEnrollment ? (
                <AuthenticatorQrCard
                  description="Scan the QR code in your authenticator app, then enter the current code."
                  manualEntryKey={challenge.enrollment?.manualEntryKey}
                  otpauthUrl={challenge.enrollment?.otpauthUrl}
                  title="Authenticator setup"
                />
              ) : null}

              {!useBackupCode ? (
                <PlatformCodeField
                  autoFocus
                  hint="Enter the 6-digit code from your authenticator app."
                  id="platform-mfa-code"
                  label="Authentication code"
                  onChange={setVerificationCode}
                  value={verificationCode}
                />
              ) : (
                <TextField
                  autoFocus
                  hint="Use a backup code if your authenticator is unavailable."
                  id="platform-backup-code"
                  label="Backup code"
                  onChange={(event) => setBackupCode(event.target.value)}
                  placeholder="ABCDE12345"
                  value={backupCode}
                />
              )}

              <div className={styles.challengeActions}>
                <Button busy={busy} className={styles.primaryAction} size="lg" type="submit">
                  Verify and continue
                </Button>
                {!isEnrollment ? (
                  <button
                    className={styles.textButton}
                    onClick={() => {
                      setError(null);
                      setUseBackupCode((current) => !current);
                      setVerificationCode("");
                      setBackupCode("");
                    }}
                    type="button"
                  >
                    {useBackupCode ? "Use authenticator code instead" : "Use backup code instead"}
                  </button>
                ) : null}
                <button className={styles.secondaryLink} onClick={handleStartOver} type="button">
                  Start over
                </button>
              </div>
            </form>

            <p className={styles.supportNote}>
              {isEnrollment
                ? "Add the account in your authenticator app, then enter the current code."
                : "Backup codes are single-use and expire immediately after verification."}
            </p>
          </>
        ) : null}
      </div>
    </PlatformAuthShell>
  );
}
