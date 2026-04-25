import { describe, expect, it } from "vitest";

import {
  platformEntitlementModuleCodes,
  tenantOnboardingLinkStatuses,
  tenantOwnerStatuses,
  tenantStatuses,
  tenantSubscriptionBillingIntervals,
  tenantSubscriptionRenewalModes,
  tenantSubscriptionStatuses,
} from "./platform-provisioning";

describe("@vision/contracts platform provisioning", () => {
  it("locks the Phase 10 tenant lifecycle statuses", () => {
    expect(tenantStatuses).toEqual(["provisioning", "active", "suspended"]);
    expect(tenantOwnerStatuses).toEqual(["invited", "activated"]);
    expect(tenantOnboardingLinkStatuses).toEqual([
      "issued",
      "revoked",
      "expired",
      "consumed",
    ]);
  });

  it("locks the Phase 10 subscription contract vocabulary", () => {
    expect(tenantSubscriptionStatuses).toEqual([
      "trialing",
      "active",
      "past_due",
      "canceled",
    ]);
    expect(tenantSubscriptionBillingIntervals).toEqual(["monthly", "yearly"]);
    expect(tenantSubscriptionRenewalModes).toEqual(["auto", "manual"]);
  });

  it("locks the minimal Phase 10 module entitlement taxonomy", () => {
    expect(platformEntitlementModuleCodes).toEqual([
      "appointments",
      "pos",
      "inventory",
      "tickets",
      "analytics",
    ]);
  });
});
