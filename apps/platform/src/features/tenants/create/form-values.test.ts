import { describe, expect, it } from "vitest";

import {
  createDefaultCreateTenantFormValues,
  validateCreateTenantFormValues,
} from "./form-values";

describe("validateCreateTenantFormValues", () => {
  it("builds the create-tenant contract from product form values", () => {
    const result = validateCreateTenantFormValues({
      ...createDefaultCreateTenantFormValues(new Date("2026-04-24T00:00:00.000Z")),
      tenantDisplayName: "North Coast Spa",
      tenantSlug: "north-coast-spa",
      ownerFullName: "Mariam Adel",
      ownerPhoneNumber: "+201001112223",
      ownerEmail: "owner@northcoast.test",
      subscriptionPlanCode: "core-monthly",
      subscriptionAmountMajor: "99.50",
      subscriptionCurrencyCode: "egp",
      entitlementsMaxBranches: "3",
      entitlementsMaxInternalUsers: "12",
      entitlementsBookingWebsiteEnabled: true,
      entitlementsEnabledModules: ["appointments", "inventory", "analytics"],
    });

    expect(result).toEqual({
      success: true,
      payload: {
        tenant: {
          displayName: "North Coast Spa",
          slug: "north-coast-spa",
        },
        owner: {
          fullName: "Mariam Adel",
          phoneNumber: "+201001112223",
          email: "owner@northcoast.test",
        },
        subscription: {
          amountMinor: 9950,
          billingInterval: "monthly",
          currencyCode: "EGP",
          currentPeriodEndAt: "2026-05-24T23:59:59.999Z",
          currentPeriodStartAt: "2026-04-24T00:00:00.000Z",
          planCode: "core-monthly",
          renewalMode: "auto",
          renewsAt: "2026-05-24T23:59:59.999Z",
          status: "trialing",
        },
        entitlements: {
          bookingWebsiteEnabled: true,
          enabledModules: ["appointments", "inventory", "analytics"],
          maxBranches: 3,
          maxInternalUsers: 12,
        },
      },
    });
  });

  it("clears renewsAt when the subscription is manual", () => {
    const result = validateCreateTenantFormValues({
      ...createDefaultCreateTenantFormValues(new Date("2026-04-24T00:00:00.000Z")),
      tenantDisplayName: "North Coast Spa",
      tenantSlug: "north-coast-spa",
      ownerFullName: "Mariam Adel",
      ownerPhoneNumber: "+201001112223",
      subscriptionPlanCode: "pilot",
      subscriptionRenewalMode: "manual",
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        payload: expect.objectContaining({
          subscription: expect.objectContaining({
            renewsAt: null,
          }),
        }),
      }),
    );
  });

  it("returns a field error when the commercial amount is invalid", () => {
    const result = validateCreateTenantFormValues({
      ...createDefaultCreateTenantFormValues(new Date("2026-04-24T00:00:00.000Z")),
      tenantDisplayName: "North Coast Spa",
      tenantSlug: "north-coast-spa",
      ownerFullName: "Mariam Adel",
      ownerPhoneNumber: "+201001112223",
      subscriptionPlanCode: "pilot",
      subscriptionAmountMajor: "9.999",
    });

    expect(result).toEqual({
      success: false,
      fieldErrors: {
        "subscription.amountMajor": "Enter a valid amount.",
      },
    });
  });

  it("maps period validation back to the end-date field", () => {
    const result = validateCreateTenantFormValues({
      ...createDefaultCreateTenantFormValues(new Date("2026-04-24T00:00:00.000Z")),
      tenantDisplayName: "North Coast Spa",
      tenantSlug: "north-coast-spa",
      ownerFullName: "Mariam Adel",
      ownerPhoneNumber: "+201001112223",
      subscriptionPlanCode: "pilot",
      subscriptionCurrentPeriodStartDate: "2026-04-24",
      subscriptionCurrentPeriodEndDate: "2026-04-20",
    });

    expect(result).toEqual({
      success: false,
      fieldErrors: {
        "subscription.currentPeriodEndDate":
          "currentPeriodEndAt must be after currentPeriodStartAt",
      },
    });
  });
});
