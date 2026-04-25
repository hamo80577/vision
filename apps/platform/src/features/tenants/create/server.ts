"use server";

import { revalidatePath } from "next/cache";

import type {
  CreateTenantResult,
  TenantSubscriptionBillingInterval,
  TenantSubscriptionRenewalMode,
  TenantSubscriptionStatus,
} from "@vision/contracts";

import { mutatePlatformApi, PlatformApiError } from "../../../lib/platform-api";
import {
  type CreateTenantFormValues,
  validateCreateTenantFormValues,
} from "./form-values";
import {
  initialCreateTenantActionState,
  type CreateTenantActionState,
} from "./state";

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

function readFormValues(formData: FormData): CreateTenantFormValues {
  return {
    tenantDisplayName: readString(formData, "tenant.displayName"),
    tenantSlug: readString(formData, "tenant.slug"),
    ownerFullName: readString(formData, "owner.fullName"),
    ownerPhoneNumber: readString(formData, "owner.phoneNumber"),
    ownerEmail: readString(formData, "owner.email"),
    subscriptionPlanCode: readString(formData, "subscription.planCode"),
    subscriptionStatus: readString(
      formData,
      "subscription.status",
    ) as TenantSubscriptionStatus,
    subscriptionBillingInterval: readString(
      formData,
      "subscription.billingInterval",
    ) as TenantSubscriptionBillingInterval,
    subscriptionRenewalMode: readString(
      formData,
      "subscription.renewalMode",
    ) as TenantSubscriptionRenewalMode,
    subscriptionAmountMajor: readString(formData, "subscription.amountMajor"),
    subscriptionCurrencyCode: readString(formData, "subscription.currencyCode"),
    subscriptionCurrentPeriodStartDate: readString(
      formData,
      "subscription.currentPeriodStartDate",
    ),
    subscriptionCurrentPeriodEndDate: readString(
      formData,
      "subscription.currentPeriodEndDate",
    ),
    entitlementsMaxBranches: readString(formData, "entitlements.maxBranches"),
    entitlementsMaxInternalUsers: readString(
      formData,
      "entitlements.maxInternalUsers",
    ),
    entitlementsBookingWebsiteEnabled:
      readString(formData, "entitlements.bookingWebsiteEnabled") === "on",
    entitlementsEnabledModules: formData
      .getAll("entitlements.enabledModules")
      .filter((value): value is string => typeof value === "string"),
  };
}

export async function createTenantAction(
  _previousState: CreateTenantActionState,
  formData: FormData,
): Promise<CreateTenantActionState> {
  const values = readFormValues(formData);
  const validation = validateCreateTenantFormValues(values);

  if (!validation.success) {
    return {
      status: "validation_error",
      fieldErrors: validation.fieldErrors,
      submitError: "Review the highlighted fields and try again.",
      result: null,
      values,
    };
  }

  try {
    const result = await mutatePlatformApi<CreateTenantResult, typeof validation.payload>({
      method: "POST",
      path: "/platform/tenants",
      body: validation.payload,
    });

    revalidatePath("/tenants");

    return {
      status: "success",
      fieldErrors: {},
      submitError: null,
      result,
      values: initialCreateTenantActionState.values,
    };
  } catch (error) {
    if (error instanceof PlatformApiError) {
      return {
        status: "error",
        fieldErrors: {},
        submitError:
          error.status === 409
            ? "A tenant with the same provisioning details already exists."
            : error.message,
        result: null,
        values,
      };
    }

    return {
      status: "error",
      fieldErrors: {},
      submitError: "Tenant could not be created right now.",
      result: null,
      values,
    };
  }
}
