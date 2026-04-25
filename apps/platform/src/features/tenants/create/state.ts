import type { CreateTenantResult } from "@vision/contracts";

import {
  createDefaultCreateTenantFormValues,
  type CreateTenantFieldErrors,
  type CreateTenantFieldErrorKey,
  type CreateTenantFormValues,
} from "./form-values";

type CreateTenantActionStatus = "idle" | "validation_error" | "error" | "success";

export type CreateTenantActionState =
  | {
      fieldErrors: CreateTenantFieldErrors;
      result: null;
      status: "idle";
      submitError: null;
      values: CreateTenantFormValues;
    }
  | {
      fieldErrors: CreateTenantFieldErrors;
      result: null;
      status: "validation_error" | "error";
      submitError: string;
      values: CreateTenantFormValues;
    }
  | {
      fieldErrors: CreateTenantFieldErrors;
      result: CreateTenantResult;
      status: "success";
      submitError: null;
      values: CreateTenantFormValues;
    };

export type SafeCreateTenantActionState = {
  fieldErrors: CreateTenantFieldErrors;
  result: CreateTenantResult | null;
  status: CreateTenantActionStatus;
  submitError: string | null;
  values: CreateTenantFormValues;
};

export const initialCreateTenantActionState: CreateTenantActionState = {
  status: "idle",
  fieldErrors: {},
  submitError: null,
  result: null,
  values: createDefaultCreateTenantFormValues(),
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizeCreateTenantFieldErrors(value: unknown): CreateTenantFieldErrors {
  if (!isRecord(value)) {
    return {};
  }

  const nextFieldErrors: CreateTenantFieldErrors = {};

  for (const [key, message] of Object.entries(value)) {
    if (typeof message === "string") {
      nextFieldErrors[key as CreateTenantFieldErrorKey] = message;
    }
  }

  return nextFieldErrors;
}

export function normalizeCreateTenantFormValues(value: unknown): CreateTenantFormValues {
  const defaults = createDefaultCreateTenantFormValues();

  if (!isRecord(value)) {
    return defaults;
  }

  const readString = (key: keyof CreateTenantFormValues, fallback: string) => {
    const nextValue = value[key];

    return typeof nextValue === "string" ? nextValue : fallback;
  };

  const readBoolean = (key: keyof CreateTenantFormValues, fallback: boolean) => {
    const nextValue = value[key];

    return typeof nextValue === "boolean" ? nextValue : fallback;
  };

  const enabledModules = value.entitlementsEnabledModules;

  return {
    tenantDisplayName: readString("tenantDisplayName", defaults.tenantDisplayName),
    tenantSlug: readString("tenantSlug", defaults.tenantSlug),
    ownerFullName: readString("ownerFullName", defaults.ownerFullName),
    ownerPhoneNumber: readString("ownerPhoneNumber", defaults.ownerPhoneNumber),
    ownerEmail: readString("ownerEmail", defaults.ownerEmail),
    subscriptionPlanCode: readString("subscriptionPlanCode", defaults.subscriptionPlanCode),
    subscriptionStatus: readString(
      "subscriptionStatus",
      defaults.subscriptionStatus,
    ) as CreateTenantFormValues["subscriptionStatus"],
    subscriptionBillingInterval: readString(
      "subscriptionBillingInterval",
      defaults.subscriptionBillingInterval,
    ) as CreateTenantFormValues["subscriptionBillingInterval"],
    subscriptionRenewalMode: readString(
      "subscriptionRenewalMode",
      defaults.subscriptionRenewalMode,
    ) as CreateTenantFormValues["subscriptionRenewalMode"],
    subscriptionAmountMajor: readString(
      "subscriptionAmountMajor",
      defaults.subscriptionAmountMajor,
    ),
    subscriptionCurrencyCode: readString(
      "subscriptionCurrencyCode",
      defaults.subscriptionCurrencyCode,
    ),
    subscriptionCurrentPeriodStartDate: readString(
      "subscriptionCurrentPeriodStartDate",
      defaults.subscriptionCurrentPeriodStartDate,
    ),
    subscriptionCurrentPeriodEndDate: readString(
      "subscriptionCurrentPeriodEndDate",
      defaults.subscriptionCurrentPeriodEndDate,
    ),
    entitlementsMaxBranches: readString(
      "entitlementsMaxBranches",
      defaults.entitlementsMaxBranches,
    ),
    entitlementsMaxInternalUsers: readString(
      "entitlementsMaxInternalUsers",
      defaults.entitlementsMaxInternalUsers,
    ),
    entitlementsBookingWebsiteEnabled: readBoolean(
      "entitlementsBookingWebsiteEnabled",
      defaults.entitlementsBookingWebsiteEnabled,
    ),
    entitlementsEnabledModules: Array.isArray(enabledModules)
      ? enabledModules.filter((moduleCode): moduleCode is string => typeof moduleCode === "string")
      : defaults.entitlementsEnabledModules,
  };
}

export function lookupCreateTenantFieldError(
  fieldErrors: unknown,
  key: CreateTenantFieldErrorKey,
): string | undefined {
  return normalizeCreateTenantFieldErrors(fieldErrors)[key];
}

export function normalizeCreateTenantActionState(state: unknown): SafeCreateTenantActionState {
  if (!isRecord(state)) {
    return {
      status: "idle",
      fieldErrors: {},
      submitError: null,
      result: null,
      values: createDefaultCreateTenantFormValues(),
    };
  }

  const status = state.status;
  const safeStatus: CreateTenantActionStatus =
    status === "validation_error" || status === "error" || status === "success"
      ? status
      : "idle";

  return {
    status: safeStatus,
    fieldErrors: normalizeCreateTenantFieldErrors(state.fieldErrors),
    submitError: typeof state.submitError === "string" ? state.submitError : null,
    result: isRecord(state.result) ? (state.result as CreateTenantResult) : null,
    values: normalizeCreateTenantFormValues(state.values),
  };
}
