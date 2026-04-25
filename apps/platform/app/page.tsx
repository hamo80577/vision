import { redirect } from "next/navigation";

import { PlatformAccessDenied } from "../src/features/home/platform-access-denied";
import { PlatformShell } from "../src/features/shell/platform-shell";
import { getPlatformAuthState } from "../src/lib/platform-auth";

export default async function PlatformHomePage() {
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

  redirect("/tenants");
}
