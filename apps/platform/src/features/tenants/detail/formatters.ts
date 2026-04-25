import type {
  TenantLifecycleEvent,
} from "@vision/contracts";

export function formatDateTime(value: string | null): string {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(new Date(value));
}

export function formatMoney(amountMinor: number, currencyCode: string): string {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: currencyCode,
  }).format(amountMinor / 100);
}

export function lifecycleEventLabel(eventType: TenantLifecycleEvent["eventType"]): string {
  switch (eventType) {
    case "tenant_created":
      return "Tenant created";
    case "owner_invited":
      return "Owner invited";
    case "owner_invite_reissued":
      return "Owner invitation reissued";
    case "owner_invite_revoked":
      return "Owner invitation revoked";
    case "owner_activated":
      return "Owner activated";
    case "subscription_initialized":
      return "Subscription initialized";
    case "subscription_updated":
      return "Subscription updated";
    case "entitlements_initialized":
      return "Entitlements initialized";
    case "entitlements_updated":
      return "Entitlements updated";
    case "tenant_activated":
      return "Tenant activated";
    case "tenant_suspended":
      return "Tenant suspended";
  }
}
