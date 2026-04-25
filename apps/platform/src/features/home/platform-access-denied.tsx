import Link from "next/link";

import { InlineNotice, SectionHeading, SurfaceCard } from "@vision/ui";

import type { PlatformAuthSession } from "../../lib/platform-auth";
import styles from "./platform-console-home.module.css";

type PlatformAccessDeniedProps = {
  auth: PlatformAuthSession;
};

export function PlatformAccessDenied({ auth }: PlatformAccessDeniedProps) {
  return (
    <div className={styles.stack}>
      <SurfaceCard tone="accent">
        <SectionHeading
          eyebrow="Access"
          title="This account cannot open the platform console."
          description="Sign in with a platform-admin account to continue."
        />
        <div className={styles.summaryGrid}>
          <div>
            <p className={styles.summaryLabel}>Resolved Subject</p>
            <p className={styles.summaryValue}>{auth.subject.loginIdentifier}</p>
          </div>
          <div>
            <p className={styles.summaryLabel}>Sensitivity</p>
            <p className={styles.summaryValue}>{auth.subject.internalSensitivity ?? "none"}</p>
          </div>
          <div>
            <p className={styles.summaryLabel}>Assurance</p>
            <p className={styles.summaryValue}>{auth.session.assuranceLevel}</p>
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard>
        <InlineNotice
          tone="warning"
          title="Platform access required."
          description="This session is valid, but it does not carry platform-admin access."
        />
        <p className={styles.paragraph}>
          <Link className="app-text-link" href="/login">
            Sign in with another account
          </Link>
        </p>
      </SurfaceCard>
    </div>
  );
}
