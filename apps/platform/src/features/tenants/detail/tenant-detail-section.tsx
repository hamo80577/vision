import Link from "next/link";

import type { PlatformTenantDetail } from "@vision/contracts";
import { EmptyState, InlineNotice } from "@vision/ui";

import { fetchPlatformApi, PlatformApiError } from "../../../lib/platform-api";
import { TenantDetailView } from "./tenant-detail-view";

type TenantDetailSectionProps = {
  tenantId: string;
};

export async function TenantDetailSection({ tenantId }: TenantDetailSectionProps) {
  try {
    const tenant = await fetchPlatformApi<PlatformTenantDetail>(`/platform/tenants/${tenantId}`);

    return <TenantDetailView tenant={tenant} />;
  } catch (error) {
    if (error instanceof PlatformApiError && error.status === 404) {
      return (
        <EmptyState
          eyebrow="Not found"
          title="Tenant not found."
          description="The requested tenant record is not available."
          action={
            <Link className="ui-button" data-size="md" data-variant="secondary" href="/tenants">
              Back to directory
            </Link>
          }
        />
      );
    }

    return (
      <div style={{ display: "grid", gap: "16px" }}>
        <InlineNotice
          tone="critical"
          title="The tenant detail page could not be loaded."
          description="Reload the page after checking the platform API connection."
        />
        <EmptyState
          eyebrow="Load failure"
          title="Tenant detail is temporarily unavailable."
          description="The tenant detail request did not complete successfully."
          action={
            <Link className="ui-button" data-size="md" data-variant="secondary" href="/tenants">
              Back to directory
            </Link>
          }
        />
      </div>
    );
  }
}
