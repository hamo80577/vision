import { redirect } from "next/navigation";

import { PlatformAccessDenied } from "../../../src/features/home/platform-access-denied";
import { PlatformShell } from "../../../src/features/shell/platform-shell";
import { TenantDetailSection } from "../../../src/features/tenants/detail/tenant-detail-section";
import { getPlatformAuthState } from "../../../src/lib/platform-auth";

type TenantDetailPageProps = {
  params: Promise<{
    tenantId: string;
  }>;
};

export default async function TenantDetailPage({ params }: TenantDetailPageProps) {
  const authState = await getPlatformAuthState();

  if (authState.status === "unauthenticated") {
    redirect("/login");
  }

  if (authState.status === "unauthorized") {
    return (
      <PlatformShell auth={authState.session}>
        <PlatformAccessDenied auth={authState.session} />
      </PlatformShell>
    );
  }

  const { tenantId } = await params;

  return (
    <PlatformShell auth={authState.session}>
      <TenantDetailSection tenantId={tenantId} />
    </PlatformShell>
  );
}
