"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import type { IssuedOwnerOnboardingLink, PlatformTenantDetail } from "@vision/contracts";
import {
  Button,
  ConfirmationDialog,
  DefinitionGrid,
  InlineNotice,
  StatusBadge,
  SurfaceCard,
} from "@vision/ui";

import { formatDateTime } from "./formatters";
import { reissueOwnerOnboardingLinkAction } from "./server";
import {
  onboardingStatusBadge,
  onboardingTone,
  ownerStatusBadge,
  ownerStatusTone,
} from "../status-formatters";
import styles from "./tenant-detail.module.css";

type OwnerOnboardingPanelProps = {
  onTenantUpdated: (tenant: PlatformTenantDetail) => void;
  showDetailLink?: boolean;
  tenant: PlatformTenantDetail;
};

export function OwnerOnboardingPanel({
  onTenantUpdated,
  showDetailLink = false,
  tenant,
}: OwnerOnboardingPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [notice, setNotice] = useState<{
    message: string;
    tone: "critical" | "positive";
  } | null>(null);
  const [latestLink, setLatestLink] = useState<IssuedOwnerOnboardingLink | null>(null);
  const canReissue = tenant.owner.status === "invited" && tenant.status !== "suspended";

  function handleReissue() {
    startTransition(async () => {
      const result = await reissueOwnerOnboardingLinkAction({
        tenantId: tenant.id,
      });

      if (!result.ok) {
        setNotice({
          tone: "critical",
          message: result.message,
        });
        setConfirmOpen(false);

        return;
      }

      onTenantUpdated(result.tenant);
      setLatestLink(result.ownerOnboardingLink);
      setNotice({
        tone: "positive",
        message: result.message,
      });
      setConfirmOpen(false);
    });
  }

  async function handleCopyLink() {
    if (!latestLink) {
      return;
    }

    await navigator.clipboard.writeText(latestLink.activationPath);
    setNotice({
      tone: "positive",
      message: "Activation path copied.",
    });
  }

  return (
    <SurfaceCard>
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionCopy}>
            <h2 className={styles.sectionTitle}>Owner onboarding</h2>
            <p className={styles.sectionDescription}>Invite status, delivery timing, and activation controls.</p>
          </div>
          {showDetailLink ? (
            <Link
              className="ui-button"
              data-size="md"
              data-variant="ghost"
              href={`/tenants/${tenant.id}/onboarding`}
            >
              Open onboarding
            </Link>
          ) : null}
          <div className={styles.badgeRow}>
            <StatusBadge tone={ownerStatusTone(tenant.owner.status)}>
              {ownerStatusBadge(tenant.owner.status)}
            </StatusBadge>
            <StatusBadge tone={onboardingTone(tenant.owner.onboardingLinkStatus)}>
              {onboardingStatusBadge(tenant.owner.onboardingLinkStatus)}
            </StatusBadge>
          </div>
        </div>

        {notice ? (
          <InlineNotice description={notice.message} title="Owner onboarding" tone={notice.tone} />
        ) : null}

        <DefinitionGrid
          items={[
            { label: "Owner", value: tenant.owner.fullName },
            { label: "Phone", value: tenant.owner.phoneNumber },
            { label: "Email", value: tenant.owner.email ?? "Not provided" },
            { label: "Owner status", value: ownerStatusBadge(tenant.owner.status) },
            { label: "Invite issued", value: formatDateTime(tenant.owner.onboardingIssuedAt) },
            { label: "Invite expires", value: formatDateTime(tenant.owner.onboardingExpiresAt) },
            { label: "Link status", value: onboardingStatusBadge(tenant.owner.onboardingLinkStatus) },
          ]}
        />

        {latestLink ? (
          <div className={styles.inviteFrame}>
            <p className={styles.inviteLabel}>Latest activation path</p>
            <p className={styles.invitePath}>{latestLink.activationPath}</p>
            <div className={styles.actionRow}>
              <Button onClick={handleCopyLink} type="button" variant="secondary">
                Copy activation path
              </Button>
            </div>
          </div>
        ) : null}

        {tenant.status === "suspended" ? (
          <InlineNotice
            title="Reissue unavailable"
            description="Onboarding links cannot be issued while the tenant is suspended."
            tone="warning"
          />
        ) : null}

        {tenant.owner.status === "invited" ? (
          <div className={styles.actionRow}>
            <Button disabled={!canReissue} onClick={() => setConfirmOpen(true)} variant="secondary">
              Reissue link
            </Button>
          </div>
        ) : null}
      </div>

      <ConfirmationDialog
        busy={isPending}
        confirmLabel="Reissue link"
        description="Reissuing the owner activation link invalidates any previously active invite links."
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleReissue}
        open={confirmOpen}
        title="Reissue owner onboarding link?"
      />
    </SurfaceCard>
  );
}
