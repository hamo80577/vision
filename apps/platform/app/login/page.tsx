import { redirect } from "next/navigation";

import { PlatformSignInFlow } from "../../src/features/auth/platform-sign-in-flow";
import { getPlatformAuthState } from "../../src/lib/platform-auth";
import { getPlatformRuntimeConfig } from "../../src/lib/runtime-config";

export default async function PlatformLoginPage() {
  const authState = await getPlatformAuthState();

  if (authState.status === "authorized") {
    redirect("/");
  }

  const config = getPlatformRuntimeConfig();

  return (
    <PlatformSignInFlow
      apiBaseUrl={config.publicApiBaseUrl}
      hasUnauthorizedSession={authState.status === "unauthorized"}
    />
  );
}
