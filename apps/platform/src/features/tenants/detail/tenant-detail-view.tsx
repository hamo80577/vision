"use client";

import { useState } from "react";
import Link from "next/link";

import type { PlatformTenantDetail } from "@vision/contracts";
import { PageHeader, StatusBadge } from "@vision/ui";

import {
  onboardingStatusBadge,
  onboardingTone,
  ownerStatusBadge,
  ownerStatusTone,
  tenantStatusBadge,
  tenantStatusTone,
} from "../status-formatters";
import { EntitlementsPanel } from "./entitlements-panel";
import { OwnerOnboardingPanel } from "./owner-onboarding-panel";
import styles from "./tenant-detail.module.css";
import { SubscriptionPanel } from "./subscription-panel";
import { TenantLifecyclePanel } from "./tenant-lifecycle-panel";
import { TenantStatusPanel } from "./tenant-status-panel";
import { TenantSummaryPanel } from "./tenant-summary-panel";

type TenantDetailViewProps = {
  tenant: PlatformTenantDetail;
};

export function TenantDetailView({ tenant: initialTenant }: TenantDetailViewProps) {
  const [tenant, setTenant] = useState(initialTenant);

  return (
    <div className={styles.stack}>
      <PageHeader
        title={tenant.displayName}
        description="Platform record and operational controls."
        actions={
          <div className={styles.headerActions}>
            <Link
              className="ui-button"
              data-size="md"
              data-variant="secondary"
              href="/tenants"
            >
              Back to directory
            </Link>
            <Link
              className="ui-button"
              data-size="md"
              data-variant="secondary"
              href={`/tenants/${tenant.id}/onboarding`}
            >
              Manage onboarding
            </Link>
          </div>
        }
        badges={
          <>
            <StatusBadge tone={tenantStatusTone(tenant.status)}>
              {tenantStatusBadge(tenant.status)}
            </StatusBadge>
            <StatusBadge tone={ownerStatusTone(tenant.owner.status)}>
              {ownerStatusBadge(tenant.owner.status)}
            </StatusBadge>
            <StatusBadge tone={onboardingTone(tenant.owner.onboardingLinkStatus)}>
              {onboardingStatusBadge(tenant.owner.onboardingLinkStatus)}
            </StatusBadge>
          </>
        }
      />

      <div className={styles.layout}>
        <div className={styles.mainColumn}>
          <TenantSummaryPanel tenant={tenant} />
          <EntitlementsPanel onTenantUpdated={setTenant} tenant={tenant} />
        </div>
        <div className={styles.sideColumn}>
          <SubscriptionPanel onTenantUpdated={setTenant} tenant={tenant} />
          <OwnerOnboardingPanel onTenantUpdated={setTenant} showDetailLink tenant={tenant} />
          <TenantStatusPanel onTenantUpdated={setTenant} tenant={tenant} />
        </div>
      </div>

      <TenantLifecyclePanel tenant={tenant} />
    </div>
  );
}
