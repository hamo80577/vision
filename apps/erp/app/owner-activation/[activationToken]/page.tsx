import { OwnerActivationFlow } from "../../../src/features/owner-activation/owner-activation-flow";
import { getOwnerActivationPageState } from "../../../src/features/owner-activation/server";
import { getErpRuntimeConfig } from "../../../src/lib/runtime-config";

type OwnerActivationPageProps = {
  params: Promise<{
    activationToken: string;
  }>;
};

export default async function OwnerActivationPage({ params }: OwnerActivationPageProps) {
  const { activationToken } = await params;
  const config = getErpRuntimeConfig();
  const state = await getOwnerActivationPageState({
    activationToken,
    apiBaseUrl: config.publicApiBaseUrl,
  });

  return (
    <OwnerActivationFlow
      activationToken={activationToken}
      apiBaseUrl={config.publicApiBaseUrl}
      state={state}
    />
  );
}
