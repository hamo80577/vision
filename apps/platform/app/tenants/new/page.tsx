import { redirect } from "next/navigation";

import { PlatformAccessDenied } from "../../../src/features/home/platform-access-denied";
import { PlatformShell } from "../../../src/features/shell/platform-shell";
import { CreateTenantForm } from "../../../src/features/tenants/create/create-tenant-form";
import { getPlatformAuthState } from "../../../src/lib/platform-auth";

export default async function CreateTenantPage() {
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
      <CreateTenantForm />
    </PlatformShell>
  );
}
