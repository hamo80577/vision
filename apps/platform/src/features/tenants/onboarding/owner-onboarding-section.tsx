import Link from "next/link";

import type { PlatformTenantDetail } from "@vision/contracts";
import { EmptyState, InlineNotice } from "@vision/ui";

import { fetchPlatformApi, PlatformApiError } from "../../../lib/platform-api";
import { OwnerOnboardingView } from "./owner-onboarding-view";

type OwnerOnboardingSectionProps = {
  tenantId: string;
};

export async function OwnerOnboardingSection({ tenantId }: OwnerOnboardingSectionProps) {
  try {
    const tenant = await fetchPlatformApi<PlatformTenantDetail>(`/platform/tenants/${tenantId}`);

    return <OwnerOnboardingView tenant={tenant} />;
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
          title="Owner onboarding could not be loaded."
          description="Reload the page after checking the platform API connection."
        />
        <EmptyState
          eyebrow="Load failure"
          title="Owner onboarding is temporarily unavailable."
          description="The onboarding request did not complete successfully."
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
