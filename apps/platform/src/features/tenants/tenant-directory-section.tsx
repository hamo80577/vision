import type { PlatformTenantSummary } from "@vision/contracts";
import { EmptyState, InlineNotice } from "@vision/ui";

import { fetchPlatformApi } from "../../lib/platform-api";
import { TenantDirectoryView } from "./tenant-directory-view";

export async function TenantDirectorySection() {
  try {
    const tenants = await fetchPlatformApi<PlatformTenantSummary[]>("/platform/tenants");

    return <TenantDirectoryView tenants={tenants} />;
  } catch {
    return (
      <div style={{ display: "grid", gap: "16px" }}>
        <InlineNotice
          tone="critical"
          title="The tenant directory could not be loaded."
          description="Reload the page after checking the platform API connection."
        />
        <EmptyState
          eyebrow="Load failure"
          title="Directory data is temporarily unavailable."
          description="The list request did not complete successfully."
        />
      </div>
    );
  }
}
