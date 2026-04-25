"use client";

import { useState } from "react";

import {
  Button,
  InlineNotice,
  TextField,
} from "@vision/ui";

import {
  loginInternal,
} from "./api";
import { persistPlatformMfaSession } from "./mfa-session";
import { PlatformAuthShell } from "./platform-auth-shell";
import styles from "./platform-auth.module.css";

type PlatformSignInFlowProps = {
  apiBaseUrl: string;
  hasUnauthorizedSession: boolean;
};

export function PlatformSignInFlow({
  apiBaseUrl,
  hasUnauthorizedSession,
}: PlatformSignInFlowProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [password, setPassword] = useState("");

  async function handleLoginSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const result = await loginInternal({
        apiBaseUrl,
        loginIdentifier,
        password,
      });

      if (result.kind === "session") {
        window.location.assign("/");
        return;
      }

      persistPlatformMfaSession({
        challengeToken: result.challengeToken,
        enrollment: null,
        loginIdentifier,
        nextStep: result.nextStep,
      });
      window.location.assign("/login/mfa");
    } catch (submissionError) {
      setError(
        submissionError instanceof Error ? submissionError.message : "Sign-in failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <PlatformAuthShell
      footerNote="Platform staff only"
      subtitle="Sign in with your internal account."
      title="Platform login"
    >
      <div className={styles.stack}>
          {hasUnauthorizedSession ? (
            <InlineNotice
              tone="warning"
              title="Platform access unavailable"
              description="Sign in with a platform-admin account to continue."
            />
          ) : null}

          {error ? (
            <InlineNotice tone="critical" title="Sign-in failed" description={error} />
          ) : null}

          <form className={styles.formStack} onSubmit={handleLoginSubmit}>
            <TextField
              autoComplete="username"
              id="platform-login-identifier"
              label="Work email or login"
              onChange={(event) => setLoginIdentifier(event.target.value)}
              placeholder="admin@vision.internal"
              required
              value={loginIdentifier}
            />
            <TextField
              autoComplete="current-password"
              id="platform-password"
              label="Password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              required
              type="password"
              value={password}
            />
            <Button busy={busy} className={styles.primaryAction} size="lg" type="submit">
              Sign in to platform
            </Button>
          </form>

          <p className={styles.supportNote}>
            Access is limited to authorized platform administrators.
          </p>
      </div>
    </PlatformAuthShell>
  );
}
