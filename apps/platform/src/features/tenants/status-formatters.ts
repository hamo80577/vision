import type {
  TenantOnboardingLinkStatus,
  TenantOwnerStatus,
  TenantStatus,
} from "@vision/contracts";

export function tenantStatusTone(
  status: TenantStatus,
): "critical" | "neutral" | "positive" | "warning" {
  switch (status) {
    case "active":
      return "positive";
    case "suspended":
      return "critical";
    default:
      return "warning";
  }
}

export function tenantStatusBadge(status: TenantStatus): string {
  switch (status) {
    case "active":
      return "Active";
    case "suspended":
      return "Suspended";
    default:
      return "Provisioning";
  }
}

export function ownerStatusTone(
  status: TenantOwnerStatus,
): "critical" | "neutral" | "positive" | "warning" {
  return status === "activated" ? "positive" : "neutral";
}

export function ownerStatusBadge(status: TenantOwnerStatus): string {
  return status === "activated" ? "Activated" : "Invited";
}

export function onboardingTone(
  status: TenantOnboardingLinkStatus | null,
): "critical" | "neutral" | "positive" | "warning" {
  switch (status) {
    case "consumed":
      return "positive";
    case "revoked":
      return "critical";
    case "expired":
      return "warning";
    case "issued":
      return "neutral";
    default:
      return "neutral";
  }
}

export function onboardingStatusBadge(status: TenantOnboardingLinkStatus | null): string {
  switch (status) {
    case "consumed":
      return "Consumed";
    case "revoked":
      return "Revoked";
    case "expired":
      return "Expired";
    case "issued":
      return "Issued";
    default:
      return "Not issued";
  }
}
