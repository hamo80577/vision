import { describe, expect, it } from "vitest";

import type { PlatformTenantDetail } from "@vision/contracts";

import {
  createEntitlementsFormValues,
  createSubscriptionFormValues,
  validateEntitlementsFormValues,
  validateSubscriptionFormValues,
} from "./form-values";

const tenantDetailFixture: PlatformTenantDetail = {
  id: "tenant_1",
  slug: "north-coast-spa",
  displayName: "North Coast Spa",
  status: "provisioning",
  statusChangedAt: "2026-04-24T10:00:00.000Z",
  owner: {
    fullName: "Mariam Adel",
    phoneNumber: "+201001112223",
    email: "owner@northcoast.test",
    status: "invited",
    onboardingLinkStatus: "issued",
    onboardingIssuedAt: "2026-04-24T10:00:00.000Z",
    onboardingExpiresAt: "2026-05-01T10:00:00.000Z",
  },
  subscription: {
    planCode: "core-monthly",
    billingInterval: "monthly",
    renewalMode: "auto",
    status: "trialing",
    amountMinor: 9950,
    currencyCode: "EGP",
    currentPeriodStartAt: "2026-04-24T00:00:00.000Z",
    currentPeriodEndAt: "2026-05-24T23:59:59.999Z",
    renewsAt: "2026-05-24T23:59:59.999Z",
  },
  entitlements: {
    maxBranches: 3,
    maxInternalUsers: 12,
    bookingWebsiteEnabled: true,
    enabledModules: ["appointments", "inventory", "analytics"],
  },
  lifecycle: [],
};

describe("tenant detail form-values", () => {
  it("creates editable defaults from the tenant detail dto", () => {
    expect(createSubscriptionFormValues(tenantDetailFixture)).toEqual({
      planCode: "core-monthly",
      billingInterval: "monthly",
      renewalMode: "auto",
      status: "trialing",
      amountMajor: "99.50",
      currencyCode: "EGP",
      currentPeriodStartDate: "2026-04-24",
      currentPeriodEndDate: "2026-05-24",
    });

    expect(createEntitlementsFormValues(tenantDetailFixture)).toEqual({
      maxBranches: "3",
      maxInternalUsers: "12",
      bookingWebsiteEnabled: true,
      enabledModules: ["appointments", "inventory", "analytics"],
    });
  });

  it("validates subscription edits into the real update contract", () => {
    const result = validateSubscriptionFormValues({
      planCode: "core-yearly",
      billingInterval: "yearly",
      renewalMode: "manual",
      status: "active",
      amountMajor: "1200.00",
      currencyCode: "usd",
      currentPeriodStartDate: "2026-04-24",
      currentPeriodEndDate: "2027-04-23",
    });

    expect(result).toEqual({
      success: true,
      payload: {
        planCode: "core-yearly",
        billingInterval: "yearly",
        renewalMode: "manual",
        status: "active",
        amountMinor: 120000,
        currencyCode: "USD",
        currentPeriodStartAt: "2026-04-24T00:00:00.000Z",
        currentPeriodEndAt: "2027-04-23T23:59:59.999Z",
        renewsAt: null,
      },
    });
  });

  it("maps invalid subscription timing back to the editable field", () => {
    const result = validateSubscriptionFormValues({
      planCode: "core-yearly",
      billingInterval: "yearly",
      renewalMode: "auto",
      status: "active",
      amountMajor: "1200.00",
      currencyCode: "USD",
      currentPeriodStartDate: "2026-04-24",
      currentPeriodEndDate: "2026-04-20",
    });

    expect(result).toEqual({
      success: false,
      fieldErrors: {
        currentPeriodEndDate: "currentPeriodEndAt must be after currentPeriodStartAt",
      },
    });
  });

  it("rejects invalid entitlement number inputs", () => {
    const result = validateEntitlementsFormValues({
      maxBranches: "3",
      maxInternalUsers: "abc",
      bookingWebsiteEnabled: false,
      enabledModules: ["appointments"],
    });

    expect(result).toEqual({
      success: false,
      fieldErrors: {
        maxInternalUsers: "Enter a whole number.",
      },
    });
  });

  it("rejects invalid entitlement contract values", () => {
    const result = validateEntitlementsFormValues({
      maxBranches: "0",
      maxInternalUsers: "12",
      bookingWebsiteEnabled: false,
      enabledModules: ["appointments", "appointments"],
    });

    expect(result).toEqual({
      success: false,
      fieldErrors: {
        maxBranches: "Too small: expected number to be >=1",
        enabledModules: "enabledModules must not contain duplicates",
      },
    });
  });
});
