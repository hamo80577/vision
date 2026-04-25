import { PlatformShell } from "../../../src/features/shell/platform-shell";
import { TenantDetailLoading } from "../../../src/features/tenants/detail/tenant-detail-loading";

const loadingAuth = {
  subject: {
    id: "loading",
    subjectType: "internal" as const,
    loginIdentifier: "loading@vision.local",
    internalSensitivity: "platform_admin" as const,
  },
  session: {
    sessionId: "loading",
    subjectId: "loading",
    subjectType: "internal" as const,
    assuranceLevel: "mfa_verified" as const,
    assuranceUpdatedAt: new Date(0).toISOString(),
    activeTenantId: null,
    activeBranchId: null,
    expiresAt: new Date(0).toISOString(),
  },
};

export default function TenantDetailPageLoading() {
  return (
    <PlatformShell auth={loadingAuth}>
      <TenantDetailLoading />
    </PlatformShell>
  );
}
