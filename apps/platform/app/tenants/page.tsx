import { Suspense } from "react";
import { redirect } from "next/navigation";

import { PlatformAccessDenied } from "../../src/features/home/platform-access-denied";
import { PlatformShell } from "../../src/features/shell/platform-shell";
import { TenantDirectoryLoading } from "../../src/features/tenants/tenant-directory-loading";
import { TenantDirectorySection } from "../../src/features/tenants/tenant-directory-section";
import { getPlatformAuthState } from "../../src/lib/platform-auth";

export default async function TenantDirectoryPage() {
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

  return (
    <PlatformShell auth={authState.session}>
      <Suspense fallback={<TenantDirectoryLoading />}>
        <TenantDirectorySection />
      </Suspense>
    </PlatformShell>
  );
}
