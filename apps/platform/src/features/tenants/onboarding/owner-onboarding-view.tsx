"use client";

import { useState } from "react";
import Link from "next/link";

import type { PlatformTenantDetail } from "@vision/contracts";
import { PageHeader, StatusBadge, SurfaceCard } from "@vision/ui";

import { TenantLifecyclePanel } from "../detail/tenant-lifecycle-panel";
import { OwnerOnboardingPanel } from "../detail/owner-onboarding-panel";
import { formatDateTime } from "../detail/formatters";
import {
  onboardingStatusBadge,
  onboardingTone,
  ownerStatusBadge,
  ownerStatusTone,
} from "../status-formatters";
import styles from "./owner-onboarding-view.module.css";

type OwnerOnboardingViewProps = {
  tenant: PlatformTenantDetail;
};

type ProgressStep = {
  complete: boolean;
  meta: string;
  title: string;
};

function createProgressSteps(tenant: PlatformTenantDetail): ProgressStep[] {
  return [
    {
      title: "Owner record created",
      complete: true,
      meta: tenant.owner.fullName,
    },
    {
      title: "Activation link issued",
      complete: tenant.owner.onboardingIssuedAt !== null,
      meta: tenant.owner.onboardingIssuedAt
        ? formatDateTime(tenant.owner.onboardingIssuedAt)
        : "Waiting for invite",
    },
    {
      title: "Owner activated",
      complete: tenant.owner.status === "activated",
      meta:
        tenant.owner.status === "activated"
          ? "Activation completed"
          : "Waiting for owner completion",
    },
  ];
}

function onboardingGuidance(tenant: PlatformTenantDetail): string {
  if (tenant.status === "suspended") {
    return "Reactivate the tenant before issuing a new link.";
  }

  if (tenant.owner.status === "activated") {
    return "Owner onboarding is complete. Continue from tenant activation and access management.";
  }

  switch (tenant.owner.onboardingLinkStatus) {
    case "expired":
      return "Issue a new link to continue owner onboarding.";
    case "revoked":
      return "A fresh link is required before the owner can continue.";
    case "consumed":
      return "The last link has been completed. Continue from tenant activation.";
    default:
      return "Use the current link while it remains active, or reissue it if delivery failed.";
  }
}

export function OwnerOnboardingView({ tenant: initialTenant }: OwnerOnboardingViewProps) {
  const [tenant, setTenant] = useState(initialTenant);
  const progressSteps = createProgressSteps(tenant);

  return (
    <div className={styles.stack}>
      <PageHeader
        title={tenant.displayName}
        description="Manage owner activation and onboarding state."
        actions={
          <div className={styles.headerActions}>
            <Link className="ui-button" data-size="md" data-variant="secondary" href={`/tenants/${tenant.id}`}>
              View tenant
            </Link>
            <Link className="ui-button" data-size="md" data-variant="ghost" href="/tenants">
              Back to directory
            </Link>
          </div>
        }
        badges={
          <>
            <StatusBadge tone={ownerStatusTone(tenant.owner.status)}>
              {ownerStatusBadge(tenant.owner.status)}
            </StatusBadge>
            <StatusBadge tone={onboardingTone(tenant.owner.onboardingLinkStatus)}>
              {onboardingStatusBadge(tenant.owner.onboardingLinkStatus)}
            </StatusBadge>
          </>
        }
      />

      <SurfaceCard tone="accent">
        <div className={styles.section}>
          <div className={styles.badgeRow}>
            <StatusBadge tone={ownerStatusTone(tenant.owner.status)}>
              {ownerStatusBadge(tenant.owner.status)}
            </StatusBadge>
            <StatusBadge tone={onboardingTone(tenant.owner.onboardingLinkStatus)}>
              {onboardingStatusBadge(tenant.owner.onboardingLinkStatus)}
            </StatusBadge>
          </div>
          <div className={styles.summaryGrid}>
            <div className={styles.summaryCard}>
              <p className={styles.summaryLabel}>Target owner</p>
              <p className={styles.summaryValue}>{tenant.owner.fullName}</p>
              <p className={styles.summaryMeta}>{tenant.owner.email ?? tenant.owner.phoneNumber}</p>
            </div>
            <div className={styles.summaryCard}>
              <p className={styles.summaryLabel}>Invite issued</p>
              <p className={styles.summaryValue}>{formatDateTime(tenant.owner.onboardingIssuedAt)}</p>
              <p className={styles.summaryMeta}>Latest onboarding link issue time</p>
            </div>
            <div className={styles.summaryCard}>
              <p className={styles.summaryLabel}>Invite expires</p>
              <p className={styles.summaryValue}>{formatDateTime(tenant.owner.onboardingExpiresAt)}</p>
              <p className={styles.summaryMeta}>Single-use activation link validity</p>
            </div>
          </div>
        </div>
      </SurfaceCard>

      <div className={styles.layout}>
        <div className={styles.mainColumn}>
          <OwnerOnboardingPanel onTenantUpdated={setTenant} tenant={tenant} />
          <TenantLifecyclePanel tenant={tenant} />
        </div>
        <div className={styles.sideColumn}>
          <SurfaceCard>
            <div className={styles.section}>
              <div>
                <h2 className={styles.sectionTitle}>Onboarding progress</h2>
                <p className={styles.sectionDescription}>Track the current owner activation state.</p>
              </div>
              <div className={styles.progressList}>
                {progressSteps.map((step) => (
                  <div className={styles.progressItem} data-complete={step.complete ? "true" : "false"} key={step.title}>
                    <p className={styles.progressTitle}>{step.title}</p>
                    <p className={styles.progressMeta}>{step.meta}</p>
                  </div>
                ))}
              </div>
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <div className={styles.section}>
              <div>
                <h2 className={styles.sectionTitle}>Operational guidance</h2>
                <p className={styles.sectionDescription}>Use the current onboarding state to decide the next action.</p>
              </div>
              <p className={styles.guidance}>{onboardingGuidance(tenant)}</p>
            </div>
          </SurfaceCard>
        </div>
      </div>
    </div>
  );
}
