import type {
  PlatformEntitlementModuleCode,
  PlatformTenantDetail,
  UpdateTenantEntitlementsInput,
  UpdateTenantSubscriptionInput,
} from "@vision/contracts";
import {
  updateTenantEntitlementsInputSchema,
  updateTenantSubscriptionInputSchema,
} from "@vision/validation";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type SubscriptionFieldErrorKey =
  | "planCode"
  | "billingInterval"
  | "renewalMode"
  | "status"
  | "amountMajor"
  | "currencyCode"
  | "currentPeriodStartDate"
  | "currentPeriodEndDate";

type EntitlementsFieldErrorKey =
  | "maxBranches"
  | "maxInternalUsers"
  | "enabledModules";

export type SubscriptionFieldErrors = Partial<Record<SubscriptionFieldErrorKey, string>>;
export type EntitlementsFieldErrors = Partial<Record<EntitlementsFieldErrorKey, string>>;

export type SubscriptionFormValues = {
  amountMajor: string;
  billingInterval: UpdateTenantSubscriptionInput["billingInterval"];
  currencyCode: string;
  currentPeriodEndDate: string;
  currentPeriodStartDate: string;
  planCode: string;
  renewalMode: UpdateTenantSubscriptionInput["renewalMode"];
  status: UpdateTenantSubscriptionInput["status"];
};

export type EntitlementsFormValues = {
  bookingWebsiteEnabled: boolean;
  enabledModules: string[];
  maxBranches: string;
  maxInternalUsers: string;
};

export type SubscriptionValidationResult =
  | {
      payload: UpdateTenantSubscriptionInput;
      success: true;
    }
  | {
      fieldErrors: SubscriptionFieldErrors;
      success: false;
    };

export type EntitlementsValidationResult =
  | {
      payload: UpdateTenantEntitlementsInput;
      success: true;
    }
  | {
      fieldErrors: EntitlementsFieldErrors;
      success: false;
    };

function formatDateInput(value: string): string {
  return value.slice(0, 10);
}

function parseWholeNumber(
  value: string,
  field: EntitlementsFieldErrorKey,
  fieldErrors: EntitlementsFieldErrors,
): number | null {
  const trimmed = value.trim();

  if (!/^\d+$/.test(trimmed)) {
    fieldErrors[field] = "Enter a whole number.";

    return null;
  }

  return Number.parseInt(trimmed, 10);
}

function parseAmountMinor(
  value: string,
  fieldErrors: SubscriptionFieldErrors,
): number | null {
  const trimmed = value.trim();

  if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed)) {
    fieldErrors.amountMajor = "Enter a valid amount.";

    return null;
  }

  const [whole, fraction = ""] = trimmed.split(".");
  const normalizedFraction = `${fraction}00`.slice(0, 2);

  return Number.parseInt(whole, 10) * 100 + Number.parseInt(normalizedFraction, 10);
}

function parseDateBoundary(
  value: string,
  field: "currentPeriodStartDate" | "currentPeriodEndDate",
  boundary: "start" | "end",
  fieldErrors: SubscriptionFieldErrors,
): string | null {
  const trimmed = value.trim();

  if (!ISO_DATE_PATTERN.test(trimmed)) {
    fieldErrors[field] = "Enter a valid date.";

    return null;
  }

  const time =
    boundary === "start" ? "T00:00:00.000Z" : "T23:59:59.999Z";

  return new Date(`${trimmed}${time}`).toISOString();
}

function toSubscriptionFieldErrorKey(path: readonly PropertyKey[]): SubscriptionFieldErrorKey | null {
  const joinedPath = path
    .filter((segment): segment is string | number => typeof segment === "string" || typeof segment === "number")
    .join(".");

  if (joinedPath === "amountMinor") {
    return "amountMajor";
  }

  if (joinedPath === "currentPeriodStartAt") {
    return "currentPeriodStartDate";
  }

  if (joinedPath === "currentPeriodEndAt") {
    return "currentPeriodEndDate";
  }

  if (
    joinedPath === "planCode" ||
    joinedPath === "billingInterval" ||
    joinedPath === "renewalMode" ||
    joinedPath === "status" ||
    joinedPath === "currencyCode"
  ) {
    return joinedPath;
  }

  return null;
}

function toEntitlementsFieldErrorKey(path: readonly PropertyKey[]): EntitlementsFieldErrorKey | null {
  const joinedPath = path
    .filter((segment): segment is string | number => typeof segment === "string" || typeof segment === "number")
    .join(".");

  if (
    joinedPath === "maxBranches" ||
    joinedPath === "maxInternalUsers" ||
    joinedPath === "enabledModules"
  ) {
    return joinedPath;
  }

  return null;
}

export function createSubscriptionFormValues(tenant: PlatformTenantDetail): SubscriptionFormValues {
  return {
    planCode: tenant.subscription.planCode,
    billingInterval: tenant.subscription.billingInterval,
    renewalMode: tenant.subscription.renewalMode,
    status: tenant.subscription.status,
    amountMajor: (tenant.subscription.amountMinor / 100).toFixed(2),
    currencyCode: tenant.subscription.currencyCode,
    currentPeriodStartDate: formatDateInput(tenant.subscription.currentPeriodStartAt),
    currentPeriodEndDate: formatDateInput(tenant.subscription.currentPeriodEndAt),
  };
}

export function createEntitlementsFormValues(tenant: PlatformTenantDetail): EntitlementsFormValues {
  return {
    maxBranches: String(tenant.entitlements.maxBranches),
    maxInternalUsers: String(tenant.entitlements.maxInternalUsers),
    bookingWebsiteEnabled: tenant.entitlements.bookingWebsiteEnabled,
    enabledModules: tenant.entitlements.enabledModules,
  };
}

export function validateSubscriptionFormValues(
  values: SubscriptionFormValues,
): SubscriptionValidationResult {
  const fieldErrors: SubscriptionFieldErrors = {};
  const amountMinor = parseAmountMinor(values.amountMajor, fieldErrors);
  const currentPeriodStartAt = parseDateBoundary(
    values.currentPeriodStartDate,
    "currentPeriodStartDate",
    "start",
    fieldErrors,
  );
  const currentPeriodEndAt = parseDateBoundary(
    values.currentPeriodEndDate,
    "currentPeriodEndDate",
    "end",
    fieldErrors,
  );

  if (Object.keys(fieldErrors).length > 0) {
    return {
      success: false,
      fieldErrors,
    };
  }

  const payload: UpdateTenantSubscriptionInput = {
    planCode: values.planCode,
    billingInterval: values.billingInterval,
    renewalMode: values.renewalMode,
    status: values.status,
    amountMinor: amountMinor as number,
    currencyCode: values.currencyCode,
    currentPeriodStartAt: currentPeriodStartAt as string,
    currentPeriodEndAt: currentPeriodEndAt as string,
    renewsAt: values.renewalMode === "auto" ? (currentPeriodEndAt as string) : null,
  };

  const validation = updateTenantSubscriptionInputSchema.safeParse(payload);

  if (!validation.success) {
    const nextFieldErrors: SubscriptionFieldErrors = {};

    for (const issue of validation.error.issues) {
      const key = toSubscriptionFieldErrorKey(issue.path);

      if (key && !nextFieldErrors[key]) {
        nextFieldErrors[key] = issue.message;
      }
    }

    return {
      success: false,
      fieldErrors: nextFieldErrors,
    };
  }

  return {
    success: true,
    payload: validation.data,
  };
}

export function validateEntitlementsFormValues(
  values: EntitlementsFormValues,
): EntitlementsValidationResult {
  const fieldErrors: EntitlementsFieldErrors = {};
  const maxBranches = parseWholeNumber(values.maxBranches, "maxBranches", fieldErrors);
  const maxInternalUsers = parseWholeNumber(
    values.maxInternalUsers,
    "maxInternalUsers",
    fieldErrors,
  );

  if (Object.keys(fieldErrors).length > 0) {
    return {
      success: false,
      fieldErrors,
    };
  }

  const payload: UpdateTenantEntitlementsInput = {
    maxBranches: maxBranches as number,
    maxInternalUsers: maxInternalUsers as number,
    bookingWebsiteEnabled: values.bookingWebsiteEnabled,
    enabledModules: values.enabledModules as PlatformEntitlementModuleCode[],
  };

  const validation = updateTenantEntitlementsInputSchema.safeParse(payload);

  if (!validation.success) {
    const nextFieldErrors: EntitlementsFieldErrors = {};

    for (const issue of validation.error.issues) {
      const key = toEntitlementsFieldErrorKey(issue.path);

      if (key && !nextFieldErrors[key]) {
        nextFieldErrors[key] = issue.message;
      }
    }

    return {
      success: false,
      fieldErrors: nextFieldErrors,
    };
  }

  return {
    success: true,
    payload: validation.data,
  };
}
