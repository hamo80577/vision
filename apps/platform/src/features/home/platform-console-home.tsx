import { InlineNotice, SectionHeading, StatusBadge, SurfaceCard } from "@vision/ui";

import type { PlatformAuthSession } from "../../lib/platform-auth";
import styles from "./platform-console-home.module.css";

type PlatformConsoleHomeProps = {
  auth: PlatformAuthSession;
};

export function PlatformConsoleHome({ auth }: PlatformConsoleHomeProps) {
  return (
    <div className={styles.stack}>
      <div className={styles.hero}>
        <SurfaceCard tone="accent">
          <SectionHeading
            eyebrow="Provisioning"
            title="The platform shell is ready for tenant operations."
            description="This slice is intentionally thin on page count and heavy on real boundaries. Tenant provisioning, owner activation, subscription state, entitlements, and suspension are all behind actual backend contracts now."
          />
          <div className={styles.summaryGrid}>
            <div>
              <p className={styles.summaryLabel}>Current Role</p>
              <p className={styles.summaryValue}>Platform Admin</p>
            </div>
            <div>
              <p className={styles.summaryLabel}>Session Assurance</p>
              <p className={styles.summaryValue}>{auth.session.assuranceLevel}</p>
            </div>
            <div>
              <p className={styles.summaryLabel}>Trust Surface</p>
              <p className={styles.summaryValue}>Platform</p>
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <StatusBadge tone="positive">Foundation live</StatusBadge>
          <p className={styles.paragraph}>
            The next screens will bind into this shell instead of rebuilding auth, branding, or layout concerns page by page.
          </p>
          <InlineNotice
            tone="neutral"
            title="What is already real"
            description="Secure owner activation, MFA continuation, platform role gating, CORS-backed app auth, and the shared UI system now exist as reusable foundations."
          />
        </SurfaceCard>
      </div>

      <div className={styles.dataGrid}>
        <SurfaceCard>
          <SectionHeading
            eyebrow="Live Session"
            title={auth.subject.loginIdentifier}
            description="Current authenticated platform subject resolved from the internal auth backend."
          />
          <div className={styles.capabilities}>
            <div className={styles.capability}>
              <p className={styles.capabilityTitle}>Subject ID</p>
              <p className={styles.capabilityDescription}>{auth.subject.id}</p>
            </div>
            <div className={styles.capability}>
              <p className={styles.capabilityTitle}>Session ID</p>
              <p className={styles.capabilityDescription}>{auth.session.sessionId}</p>
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard tone="muted">
          <SectionHeading
            eyebrow="Next Screens"
            title="Directory, create flow, and tenant detail attach here next."
            description="Those pages can now stay orchestration-focused because auth, branding, layout, and activation handoff are already centralized."
          />
          <div className={styles.capabilities}>
            <div className={styles.capability}>
              <p className={styles.capabilityTitle}>Tenant Directory</p>
              <p className={styles.capabilityDescription}>
                Real list contract, status visibility, onboarding state, and entitlement snapshot.
              </p>
            </div>
            <div className={styles.capability}>
              <p className={styles.capabilityTitle}>Create Tenant</p>
              <p className={styles.capabilityDescription}>
                Thin page orchestration over the transactional create-tenant command already running in the API.
              </p>
            </div>
          </div>
        </SurfaceCard>
      </div>
    </div>
  );
}
