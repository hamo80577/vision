import { describe, expect, it } from "vitest";

import {
  completeOwnerActivationInputSchema,
  createTenantInputSchema,
  updateTenantEntitlementsInputSchema,
  updateTenantSubscriptionInputSchema,
} from "./platform-provisioning";

describe("@vision/validation platform provisioning", () => {
  it("parses a valid tenant provisioning payload", () => {
    expect(
      createTenantInputSchema.parse({
        tenant: {
          slug: "north-giza",
          displayName: "North Giza Studio",
        },
        owner: {
          fullName: "Mariam Hassan",
          phoneNumber: "+201001234567",
          email: "owner@northgiza.test",
        },
        subscription: {
          planCode: "growth",
          billingInterval: "monthly",
          renewalMode: "auto",
          status: "trialing",
          amountMinor: 249900,
          currencyCode: "EGP",
          currentPeriodStartAt: "2026-05-01T00:00:00.000Z",
          currentPeriodEndAt: "2026-06-01T00:00:00.000Z",
          renewsAt: "2026-06-01T00:00:00.000Z",
        },
        entitlements: {
          maxBranches: 3,
          maxInternalUsers: 18,
          bookingWebsiteEnabled: true,
          enabledModules: ["appointments", "pos", "inventory"],
        },
      }),
    ).toMatchObject({
      tenant: {
        slug: "north-giza",
        displayName: "North Giza Studio",
      },
      owner: {
        fullName: "Mariam Hassan",
        phoneNumber: "+201001234567",
      },
      entitlements: {
        enabledModules: ["appointments", "pos", "inventory"],
      },
    });
  });

  it("rejects unknown fields in tenant provisioning payloads", () => {
    expect(() =>
      createTenantInputSchema.parse({
        tenant: {
          slug: "north-giza",
          displayName: "North Giza Studio",
          status: "active",
        },
        owner: {
          fullName: "Mariam Hassan",
          phoneNumber: "+201001234567",
        },
        subscription: {
          planCode: "growth",
          billingInterval: "monthly",
          renewalMode: "auto",
          status: "trialing",
          amountMinor: 249900,
          currencyCode: "EGP",
          currentPeriodStartAt: "2026-05-01T00:00:00.000Z",
          currentPeriodEndAt: "2026-06-01T00:00:00.000Z",
        },
        entitlements: {
          maxBranches: 3,
          maxInternalUsers: 18,
          bookingWebsiteEnabled: true,
          enabledModules: ["appointments", "pos"],
        },
      }),
    ).toThrowErrorMatchingInlineSnapshot(`
      [ZodError: [
        {
          "code": "unrecognized_keys",
          "keys": [
            "status"
          ],
          "path": [
            "tenant"
          ],
          "message": "Unrecognized key: \\"status\\""
        }
      ]]
    `);
  });

  it("rejects duplicate enabled modules", () => {
    expect(() =>
      updateTenantEntitlementsInputSchema.parse({
        maxBranches: 2,
        maxInternalUsers: 12,
        bookingWebsiteEnabled: false,
        enabledModules: ["appointments", "appointments"],
      }),
    ).toThrowErrorMatchingInlineSnapshot(`
      [ZodError: [
        {
          "code": "custom",
          "path": [
            "enabledModules"
          ],
          "message": "enabledModules must not contain duplicates"
        }
      ]]
    `);
  });

  it("rejects subscription periods that end before they start", () => {
    expect(() =>
      updateTenantSubscriptionInputSchema.parse({
        planCode: "growth",
        billingInterval: "monthly",
        renewalMode: "manual",
        status: "active",
        amountMinor: 249900,
        currencyCode: "EGP",
        currentPeriodStartAt: "2026-06-01T00:00:00.000Z",
        currentPeriodEndAt: "2026-05-01T00:00:00.000Z",
        renewsAt: null,
      }),
    ).toThrowErrorMatchingInlineSnapshot(`
      [ZodError: [
        {
          "code": "custom",
          "path": [
            "currentPeriodEndAt"
          ],
          "message": "currentPeriodEndAt must be after currentPeriodStartAt"
        }
      ]]
    `);
  });

  it("requires matching passwords for owner activation completion", () => {
    expect(() =>
      completeOwnerActivationInputSchema.parse({
        password: "SupersafePass123",
        passwordConfirmation: "SupersafePass124",
      }),
    ).toThrowErrorMatchingInlineSnapshot(`
      [ZodError: [
        {
          "code": "custom",
          "path": [
            "passwordConfirmation"
          ],
          "message": "passwordConfirmation must match password"
        }
      ]]
    `);
  });
});
