import { redirect } from "next/navigation";

import { PlatformAccessDenied } from "../../../../src/features/home/platform-access-denied";
import { PlatformShell } from "../../../../src/features/shell/platform-shell";
import { OwnerOnboardingSection } from "../../../../src/features/tenants/onboarding/owner-onboarding-section";
import { getPlatformAuthState } from "../../../../src/lib/platform-auth";

type OwnerOnboardingPageProps = {
  params: Promise<{
    tenantId: string;
  }>;
};

export default async function OwnerOnboardingPage({ params }: OwnerOnboardingPageProps) {
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
      <OwnerOnboardingSection tenantId={tenantId} />
    </PlatformShell>
  );
}
