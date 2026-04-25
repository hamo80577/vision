import { createHash } from "node:crypto";

import type { tenantOnboardingLinks } from "@vision/db";

export type TenantOnboardingLinkRow = typeof tenantOnboardingLinks.$inferSelect;

export function hashOnboardingActivationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function deriveOnboardingLinkStatus(
  link: TenantOnboardingLinkRow | null,
  referenceTime: Date,
) {
  if (!link) {
    return null;
  }

  if (link.consumedAt) {
    return "consumed" as const;
  }

  if (link.revokedAt) {
    return "revoked" as const;
  }

  if (link.expiresAt.getTime() <= referenceTime.getTime()) {
    return "expired" as const;
  }

  return "issued" as const;
}

export function maskPhoneNumber(value: string): string {
  const trimmed = value.trim();
  const visibleTail = trimmed.slice(-4);
  const prefix = trimmed.startsWith("+") ? "+" : "";

  return `${prefix}••••${visibleTail}`;
}

export function maskEmail(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  const atIndex = trimmed.indexOf("@");

  if (atIndex <= 0) {
    return "••••";
  }

  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex);
  const visibleLead = local.slice(0, 1);

  return `${visibleLead}•••${domain}`;
}
