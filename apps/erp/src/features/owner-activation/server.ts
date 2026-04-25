import type { OwnerActivationView } from "@vision/contracts";

export type OwnerActivationPageState =
  | { kind: "invalid" }
  | { kind: "resolved"; view: OwnerActivationView };

export async function getOwnerActivationPageState(input: {
  activationToken: string;
  apiBaseUrl: string;
}): Promise<OwnerActivationPageState> {
  const response = await fetch(
    `${input.apiBaseUrl}/owner-activation/${encodeURIComponent(input.activationToken)}`,
    {
      cache: "no-store",
    },
  );

  if (response.status === 404) {
    return { kind: "invalid" };
  }

  if (!response.ok) {
    throw new Error("Failed to load owner activation context.");
  }

  return {
    kind: "resolved",
    view: (await response.json()) as OwnerActivationView,
  };
}
