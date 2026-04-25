"use client";

import { useState, useTransition } from "react";

import type { PlatformTenantDetail } from "@vision/contracts";
import {
  ActionBar,
  Button,
  ConfirmationDialog,
  DefinitionGrid,
  InlineNotice,
  StatusBadge,
  SurfaceCard,
} from "@vision/ui";

import { activateTenantAction, suspendTenantAction } from "./server";
import { formatDateTime } from "./formatters";
import {
  onboardingStatusBadge,
  ownerStatusBadge,
  ownerStatusTone,
  tenantStatusBadge,
  tenantStatusTone,
} from "../status-formatters";
import styles from "./tenant-detail.module.css";

type TenantStatusPanelProps = {
  onTenantUpdated: (tenant: PlatformTenantDetail) => void;
  tenant: PlatformTenantDetail;
};

export function TenantStatusPanel({ onTenantUpdated, tenant }: TenantStatusPanelProps) {
  const [pendingAction, setPendingAction] = useState<"activate" | "suspend" | null>(null);
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{
    message: string;
    tone: "critical" | "positive";
  } | null>(null);

  function handleActivate() {
    startTransition(async () => {
      const result = await activateTenantAction({
        tenantId: tenant.id,
      });

      if (!result.ok) {
        setNotice({
          tone: "critical",
          message: result.message,
        });
        setPendingAction(null);

        return;
      }

      onTenantUpdated(result.tenant);
      setNotice({
        tone: "positive",
        message:
          tenant.status === "suspended"
            ? "Tenant reactivated. Access has been restored."
            : "Tenant activated. Access is now live.",
      });
      setPendingAction(null);
    });
  }

  function handleSuspend() {
    startTransition(async () => {
      const result = await suspendTenantAction({
        tenantId: tenant.id,
      });

      if (!result.ok) {
        setNotice({
          tone: "critical",
          message: result.message,
        });
        setPendingAction(null);

        return;
      }

      onTenantUpdated(result.tenant);
      setNotice({
        tone: "positive",
        message: "Tenant suspended. Owner access has been paused.",
      });
      setPendingAction(null);
    });
  }

  const activateLabel = tenant.status === "suspended" ? "Reactivate tenant" : "Activate tenant";

  return (
    <SurfaceCard tone="accent">
      <div className={styles.section}>
        <div className={styles.sectionCopy}>
          <h2 className={styles.sectionTitle}>Operational state</h2>
          <p className={styles.statusValue}>{tenantStatusBadge(tenant.status)}</p>
          <p className={styles.statusMeta}>Enable access, suspend access, or restore service.</p>
        </div>

        <div className={styles.badgeRow}>
          <StatusBadge tone={tenantStatusTone(tenant.status)}>
            {tenantStatusBadge(tenant.status)}
          </StatusBadge>
          <StatusBadge tone={ownerStatusTone(tenant.owner.status)}>
            {ownerStatusBadge(tenant.owner.status)}
          </StatusBadge>
        </div>

        {notice ? <InlineNotice description={notice.message} title="Operational state updated" tone={notice.tone} /> : null}

        <DefinitionGrid
          items={[
            { label: "Changed", value: formatDateTime(tenant.statusChangedAt) },
            { label: "Owner status", value: ownerStatusBadge(tenant.owner.status) },
            { label: "Onboarding", value: onboardingStatusBadge(tenant.owner.onboardingLinkStatus) },
          ]}
        />

        <ActionBar align="start">
          {tenant.status !== "active" ? (
            <Button onClick={() => setPendingAction("activate")}>{activateLabel}</Button>
          ) : null}
          {tenant.status !== "suspended" ? (
            <Button onClick={() => setPendingAction("suspend")} variant="secondary">
              Suspend tenant
            </Button>
          ) : null}
        </ActionBar>
      </div>

      <ConfirmationDialog
        busy={isPending && pendingAction === "activate"}
        confirmLabel={activateLabel}
        description="This allows tenant-side access for active sessions and future sign-ins."
        onCancel={() => setPendingAction(null)}
        onConfirm={handleActivate}
        open={pendingAction === "activate"}
        title={`${activateLabel}?`}
      />
      <ConfirmationDialog
        busy={isPending && pendingAction === "suspend"}
        confirmLabel="Suspend tenant"
        description="Suspending a tenant revokes active owner sessions and invalidates active onboarding links."
        onCancel={() => setPendingAction(null)}
        onConfirm={handleSuspend}
        open={pendingAction === "suspend"}
        title="Suspend tenant?"
      />
    </SurfaceCard>
  );
}
