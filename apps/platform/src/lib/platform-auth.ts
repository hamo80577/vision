import { cookies } from "next/headers";

import { getPlatformRuntimeConfig } from "./runtime-config";

export type PlatformAuthSession = {
  subject: {
    id: string;
    subjectType: "customer" | "internal";
    loginIdentifier: string;
    internalSensitivity: "none" | "platform_admin" | "tenant_owner" | "branch_manager" | null;
  };
  session: {
    sessionId: string;
    subjectId: string;
    subjectType: "customer" | "internal";
    assuranceLevel: "basic" | "mfa_verified" | "step_up_verified";
    assuranceUpdatedAt: string;
    activeTenantId: string | null;
    activeBranchId: string | null;
    expiresAt: string;
  };
};

export type PlatformAuthState =
  | { status: "unauthenticated" }
  | { status: "unauthorized"; session: PlatformAuthSession }
  | { status: "authorized"; session: PlatformAuthSession };

export async function getPlatformAuthState(): Promise<PlatformAuthState> {
  const config = getPlatformRuntimeConfig();
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  const response = await fetch(`${config.publicApiBaseUrl}/auth/session`, {
    cache: "no-store",
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });

  if (response.status === 401) {
    return { status: "unauthenticated" };
  }

  if (!response.ok) {
    throw new Error("Failed to resolve platform session.");
  }

  const session = (await response.json()) as PlatformAuthSession;

  if (
    session.subject.subjectType !== "internal" ||
    session.subject.internalSensitivity !== "platform_admin"
  ) {
    return {
      status: "unauthorized",
      session,
    };
  }

  return {
    status: "authorized",
    session,
  };
}
