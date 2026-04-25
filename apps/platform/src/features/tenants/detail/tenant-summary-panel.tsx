import type { PlatformTenantDetail } from "@vision/contracts";
import { DefinitionGrid, SurfaceCard } from "@vision/ui";

import { formatDateTime, formatMoney } from "./formatters";
import styles from "./tenant-detail.module.css";

type TenantSummaryPanelProps = {
  tenant: PlatformTenantDetail;
};

export function TenantSummaryPanel({ tenant }: TenantSummaryPanelProps) {
  return (
    <SurfaceCard>
      <div className={styles.section}>
        <div className={styles.sectionCopy}>
          <h2 className={styles.sectionTitle}>Tenant profile</h2>
          <p className={styles.sectionDescription}>Identity, owner contact, and current plan record.</p>
        </div>
        <DefinitionGrid
          columns={2}
          items={[
            { label: "Tenant ID", value: <span className={styles.monoValue}>{tenant.id}</span> },
            { label: "Slug", value: tenant.slug },
            { label: "Owner", value: tenant.owner.fullName },
            { label: "Phone", value: tenant.owner.phoneNumber },
            { label: "Email", value: tenant.owner.email ?? "Not provided" },
            { label: "Plan", value: tenant.subscription.planCode },
            {
              label: "Current amount",
              value: formatMoney(tenant.subscription.amountMinor, tenant.subscription.currencyCode),
            },
            { label: "Status changed", value: formatDateTime(tenant.statusChangedAt) },
          ]}
        />
      </div>
    </SurfaceCard>
  );
}
