"use client";

import { useMemo, useState } from "react";

import type { PlatformTenantDetail } from "@vision/contracts";
import { Button, EmptyState, SurfaceCard } from "@vision/ui";

import { formatDateTime, lifecycleEventLabel } from "./formatters";
import styles from "./tenant-detail.module.css";

type TenantLifecyclePanelProps = {
  tenant: PlatformTenantDetail;
};

export function TenantLifecyclePanel({ tenant }: TenantLifecyclePanelProps) {
  const [visibleCount, setVisibleCount] = useState(10);
  const sortedLifecycle = useMemo(() => {
    return [...tenant.lifecycle].sort(
      (first, second) =>
        new Date(second.occurredAt).getTime() - new Date(first.occurredAt).getTime(),
    );
  }, [tenant.lifecycle]);
  const visibleLifecycle = sortedLifecycle.slice(0, visibleCount);
  const hasMore = visibleCount < sortedLifecycle.length;

  return (
    <SurfaceCard>
      <div className={styles.section}>
        <div className={styles.sectionCopy}>
          <h2 className={styles.sectionTitle}>Activity log</h2>
        </div>

        {sortedLifecycle.length === 0 ? (
          <EmptyState
            eyebrow="No events"
            title="No lifecycle events yet."
            description="Lifecycle activity will appear here as provisioning actions occur."
          />
        ) : (
          <>
            <div className={styles.lifecycleList}>
              {visibleLifecycle.map((event) => (
                <div className={styles.lifecycleItem} key={event.id}>
                  <p className={styles.lifecycleTitle}>{lifecycleEventLabel(event.eventType)}</p>
                  <p className={styles.lifecycleMeta}>
                    {event.actorType.replace("_", " ")} · {formatDateTime(event.occurredAt)}
                  </p>
                </div>
              ))}
            </div>
            {hasMore ? (
              <div className={styles.loadMoreRow}>
                <Button
                  onClick={() => setVisibleCount((current) => current + 10)}
                  type="button"
                  variant="secondary"
                >
                  Load more
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </SurfaceCard>
  );
}
