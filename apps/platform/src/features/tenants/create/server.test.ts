import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CreateTenantResult } from "@vision/contracts";

import { createDefaultCreateTenantFormValues } from "./form-values";
import { initialCreateTenantActionState } from "./state";
import { createTenantAction } from "./server";
import * as serverActions from "./server";

const { mutatePlatformApiMock, revalidatePathMock } = vi.hoisted(() => ({
  mutatePlatformApiMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("../../../lib/platform-api", async () => {
  const actual = await vi.importActual<typeof import("../../../lib/platform-api")>(
    "../../../lib/platform-api",
  );

  return {
    ...actual,
    mutatePlatformApi: mutatePlatformApiMock,
  };
});

function buildFormData(
  overrides: Partial<ReturnType<typeof createDefaultCreateTenantFormValues>> = {},
) {
  const values = {
    ...createDefaultCreateTenantFormValues(new Date("2026-04-24T00:00:00.000Z")),
    tenantDisplayName: "North Coast Spa",
    tenantSlug: "north-coast-spa",
    ownerFullName: "Mariam Adel",
    ownerPhoneNumber: "+201001112223",
    ownerEmail: "owner@northcoast.test",
    subscriptionPlanCode: "core-monthly",
    ...overrides,
  };

  const formData = new FormData();
  formData.set("tenant.displayName", values.tenantDisplayName);
  formData.set("tenant.slug", values.tenantSlug);
  formData.set("owner.fullName", values.ownerFullName);
  formData.set("owner.phoneNumber", values.ownerPhoneNumber);
  formData.set("owner.email", values.ownerEmail);
  formData.set("subscription.planCode", values.subscriptionPlanCode);
  formData.set("subscription.status", values.subscriptionStatus);
  formData.set("subscription.billingInterval", values.subscriptionBillingInterval);
  formData.set("subscription.renewalMode", values.subscriptionRenewalMode);
  formData.set("subscription.amountMajor", values.subscriptionAmountMajor);
  formData.set("subscription.currencyCode", values.subscriptionCurrencyCode);
  formData.set("subscription.currentPeriodStartDate", values.subscriptionCurrentPeriodStartDate);
  formData.set("subscription.currentPeriodEndDate", values.subscriptionCurrentPeriodEndDate);
  formData.set("entitlements.maxBranches", values.entitlementsMaxBranches);
  formData.set("entitlements.maxInternalUsers", values.entitlementsMaxInternalUsers);

  if (values.entitlementsBookingWebsiteEnabled) {
    formData.set("entitlements.bookingWebsiteEnabled", "on");
  }

  for (const moduleCode of values.entitlementsEnabledModules) {
    formData.append("entitlements.enabledModules", moduleCode);
  }

  return formData;
}

const submittedValues = {
  ...createDefaultCreateTenantFormValues(new Date("2026-04-24T00:00:00.000Z")),
  tenantDisplayName: "North Coast Spa",
  tenantSlug: "north-coast-spa",
  ownerFullName: "Mariam Adel",
  ownerPhoneNumber: "+201001112223",
  ownerEmail: "owner@northcoast.test",
  subscriptionPlanCode: "core-monthly",
};

describe("createTenantAction", () => {
  beforeEach(() => {
    mutatePlatformApiMock.mockReset();
    revalidatePathMock.mockReset();
  });

  it("exports async server actions only", () => {
    for (const [exportName, exportedValue] of Object.entries(serverActions)) {
      expect(exportedValue, exportName).toBeInstanceOf(Function);
      expect(exportedValue.constructor.name, exportName).toBe("AsyncFunction");
    }
  });

  it("returns a safe validation error shape", async () => {
    const values = {
      ...submittedValues,
      tenantDisplayName: "",
    };
    const result = await createTenantAction(
      initialCreateTenantActionState,
      buildFormData(values),
    );

    expect(result).toEqual({
      status: "validation_error",
      fieldErrors: {
        "tenant.displayName": "Too small: expected string to have >=1 characters",
      },
      submitError: "Review the highlighted fields and try again.",
      result: null,
      values,
    });
  });

  it("returns an invalid slug field error and preserves all submitted values", async () => {
    const values = {
      ...submittedValues,
      tenantSlug: "North Coast Spa",
      entitlementsBookingWebsiteEnabled: true,
      entitlementsEnabledModules: ["appointments", "pos"],
      entitlementsMaxBranches: "4",
      entitlementsMaxInternalUsers: "12",
      ownerEmail: "mariam@northcoast.test",
      ownerFullName: "Mariam Adel Soliman",
      ownerPhoneNumber: "+201001112224",
      subscriptionAmountMajor: "149.99",
      subscriptionBillingInterval: "yearly",
      subscriptionCurrencyCode: "egp",
      subscriptionPlanCode: "professional-yearly",
      subscriptionRenewalMode: "manual",
      subscriptionStatus: "active",
      tenantDisplayName: "North Coast Spa Premium",
    } satisfies ReturnType<typeof createDefaultCreateTenantFormValues>;

    const result = await createTenantAction(
      initialCreateTenantActionState,
      buildFormData(values),
    );

    expect(result).toMatchObject({
      status: "validation_error",
      fieldErrors: {
        "tenant.slug": expect.any(String),
      },
      submitError: "Review the highlighted fields and try again.",
      result: null,
      values,
    });
  });

  it("returns a safe failed-submit shape", async () => {
    mutatePlatformApiMock.mockRejectedValue(new Error("offline"));

    const result = await createTenantAction(
      initialCreateTenantActionState,
      buildFormData(),
    );

    expect(result).toEqual({
      status: "error",
      fieldErrors: {},
      submitError: "Tenant could not be created right now.",
      result: null,
      values: submittedValues,
    });
  });

  it("returns a success state with fieldErrors normalized to an empty object", async () => {
    const payload: CreateTenantResult = {
      tenant: {
        id: "tenant_123",
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
          onboardingExpiresAt: "2026-04-26T10:00:00.000Z",
        },
        subscription: {
          planCode: "core-monthly",
          billingInterval: "monthly",
          renewalMode: "auto",
          status: "trialing",
          amountMinor: 0,
          currencyCode: "USD",
          currentPeriodStartAt: "2026-04-24T00:00:00.000Z",
          currentPeriodEndAt: "2026-05-24T23:59:59.999Z",
          renewsAt: "2026-05-24T23:59:59.999Z",
        },
        entitlements: {
          maxBranches: 1,
          maxInternalUsers: 5,
          bookingWebsiteEnabled: false,
          enabledModules: [],
        },
        lifecycle: [],
      },
      ownerOnboardingLink: {
        linkId: "link_123",
        activationToken: "token",
        activationPath: "/owner-activation/token",
        issuedAt: "2026-04-24T10:00:00.000Z",
        expiresAt: "2026-04-26T10:00:00.000Z",
      },
    };
    mutatePlatformApiMock.mockResolvedValue(payload);

    const result = await createTenantAction(
      initialCreateTenantActionState,
      buildFormData(),
    );

    expect(result).toEqual({
      status: "success",
      fieldErrors: {},
      submitError: null,
      result: payload,
      values: initialCreateTenantActionState.values,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/tenants");
  });
});
