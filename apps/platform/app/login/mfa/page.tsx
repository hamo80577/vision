import { redirect } from "next/navigation";

import { PlatformMfaFlow } from "../../../src/features/auth/platform-mfa-flow";
import { getPlatformAuthState } from "../../../src/lib/platform-auth";
import { getPlatformRuntimeConfig } from "../../../src/lib/runtime-config";

export default async function PlatformMfaPage() {
  const authState = await getPlatformAuthState();

  if (authState.status === "authorized") {
    redirect("/");
  }

  const config = getPlatformRuntimeConfig();

  return <PlatformMfaFlow apiBaseUrl={config.publicApiBaseUrl} />;
}
