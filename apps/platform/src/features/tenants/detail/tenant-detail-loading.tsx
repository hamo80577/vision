import { LoadingSkeleton, PageHeader, SurfaceCard } from "@vision/ui";

import styles from "./tenant-detail.module.css";

export function TenantDetailLoading() {
  return (
    <div className={styles.stack}>
      <PageHeader eyebrow="Provisioning" title="Tenant" description="Loading tenant details." />
      <div className={styles.layout}>
        <div className={styles.mainColumn}>
          <SurfaceCard>
            <LoadingSkeleton rows={4} variant="card" />
          </SurfaceCard>
          <SurfaceCard>
            <LoadingSkeleton rows={6} variant="card" />
          </SurfaceCard>
          <SurfaceCard>
            <LoadingSkeleton rows={6} variant="card" />
          </SurfaceCard>
          <SurfaceCard>
            <LoadingSkeleton rows={5} variant="card" />
          </SurfaceCard>
        </div>
        <div className={styles.sideColumn}>
          <SurfaceCard>
            <LoadingSkeleton rows={4} variant="card" />
          </SurfaceCard>
          <SurfaceCard>
            <LoadingSkeleton rows={5} variant="card" />
          </SurfaceCard>
        </div>
      </div>
    </div>
  );
}
