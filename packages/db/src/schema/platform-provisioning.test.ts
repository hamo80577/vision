import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  platformLifecycleActorType,
  platformLifecycleEventType,
  platformModuleCode,
  tenantEntitlements,
  tenantOnboardingLinkRevocationReason,
  tenantOnboardingLinks,
  tenantOwners,
  tenantStatus,
  tenantSubscriptionBillingInterval,
  tenantSubscriptionRenewalMode,
  tenantSubscriptionStatus,
  tenantSubscriptions,
  tenants,
} from "./platform-provisioning";

describe("@vision/db platform provisioning schema", () => {
  it("defines the expected global provisioning tables", () => {
    expect(getTableName(tenants)).toBe("tenants");
    expect(getTableName(tenantOwners)).toBe("tenant_owners");
    expect(getTableName(tenantSubscriptions)).toBe("tenant_subscriptions");
    expect(getTableName(tenantEntitlements)).toBe("tenant_entitlements");
    expect(getTableName(tenantOnboardingLinks)).toBe("tenant_owner_onboarding_links");
  });

  it("locks the Phase 10 enum vocabulary", () => {
    expect(tenantStatus.enumValues).toEqual(["provisioning", "active", "suspended"]);
    expect(tenantSubscriptionStatus.enumValues).toEqual([
      "trialing",
      "active",
      "past_due",
      "canceled",
    ]);
    expect(tenantSubscriptionBillingInterval.enumValues).toEqual([
      "monthly",
      "yearly",
    ]);
    expect(tenantSubscriptionRenewalMode.enumValues).toEqual(["auto", "manual"]);
    expect(platformModuleCode.enumValues).toEqual([
      "appointments",
      "pos",
      "inventory",
      "tickets",
      "analytics",
    ]);
    expect(tenantOnboardingLinkRevocationReason.enumValues).toEqual([
      "reissued",
      "manually_revoked",
    ]);
    expect(platformLifecycleActorType.enumValues).toEqual([
      "platform_admin",
      "tenant_owner",
      "system",
    ]);
    expect(platformLifecycleEventType.enumValues).toEqual([
      "tenant_created",
      "owner_invited",
      "owner_invite_reissued",
      "owner_invite_revoked",
      "owner_activated",
      "subscription_initialized",
      "subscription_updated",
      "entitlements_initialized",
      "entitlements_updated",
      "tenant_activated",
      "tenant_suspended",
    ]);
  });

  it("keeps owner auth linkage optional until activation completes", () => {
    const columns = getTableColumns(tenantOwners);

    expect(columns.authSubjectId.notNull).toBe(false);
    expect(columns.status.notNull).toBe(true);
    expect(columns.tenantId.notNull).toBe(true);
  });
});
