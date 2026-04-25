import type {
  CreateTenantInput,
  PlatformEntitlementModuleCode,
  TenantSubscriptionBillingInterval,
  TenantSubscriptionRenewalMode,
  TenantSubscriptionStatus,
} from "@vision/contracts";
import { createTenantInputSchema } from "@vision/validation";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const FIELD_ERROR_ALIASES: Record<string, CreateTenantFieldErrorKey> = {
  "subscription.amountMinor": "subscription.amountMajor",
  "subscription.currentPeriodStartAt": "subscription.currentPeriodStartDate",
  "subscription.currentPeriodEndAt": "subscription.currentPeriodEndDate",
};

export type CreateTenantFieldErrorKey =
  | "tenant.displayName"
  | "tenant.slug"
  | "owner.fullName"
  | "owner.phoneNumber"
  | "owner.email"
  | "subscription.planCode"
  | "subscription.billingInterval"
  | "subscription.renewalMode"
  | "subscription.status"
  | "subscription.amountMajor"
  | "subscription.currencyCode"
  | "subscription.currentPeriodStartDate"
  | "subscription.currentPeriodEndDate"
  | "entitlements.maxBranches"
  | "entitlements.maxInternalUsers"
  | "entitlements.enabledModules";

export type CreateTenantFieldErrors = Partial<Record<CreateTenantFieldErrorKey, string>>;

export type CreateTenantFormValues = {
  entitlementsBookingWebsiteEnabled: boolean;
  entitlementsEnabledModules: string[];
  entitlementsMaxBranches: string;
  entitlementsMaxInternalUsers: string;
  ownerEmail: string;
  ownerFullName: string;
  ownerPhoneNumber: string;
  subscriptionAmountMajor: string;
  subscriptionBillingInterval: TenantSubscriptionBillingInterval;
  subscriptionCurrencyCode: string;
  subscriptionCurrentPeriodEndDate: string;
  subscriptionCurrentPeriodStartDate: string;
  subscriptionPlanCode: string;
  subscriptionRenewalMode: TenantSubscriptionRenewalMode;
  subscriptionStatus: TenantSubscriptionStatus;
  tenantDisplayName: string;
  tenantSlug: string;
};

export type CreateTenantFormValidationResult =
  | {
      payload: CreateTenantInput;
      success: true;
    }
  | {
      fieldErrors: CreateTenantFieldErrors;
      success: false;
    };

function formatDateInput(value: Date): string {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setDate(next.getDate() + days);

  return next;
}

function parseWholeNumber(
  value: string,
  field: CreateTenantFieldErrorKey,
  fieldErrors: CreateTenantFieldErrors,
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
  fieldErrors: CreateTenantFieldErrors,
): number | null {
  const trimmed = value.trim();

  if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed)) {
    fieldErrors["subscription.amountMajor"] = "Enter a valid amount.";

    return null;
  }

  const [whole, fraction = ""] = trimmed.split(".");
  const normalizedFraction = `${fraction}00`.slice(0, 2);

  return Number.parseInt(whole, 10) * 100 + Number.parseInt(normalizedFraction, 10);
}

function parseDateBoundary(
  value: string,
  field: "subscription.currentPeriodStartDate" | "subscription.currentPeriodEndDate",
  boundary: "start" | "end",
  fieldErrors: CreateTenantFieldErrors,
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

function toFieldErrorKey(path: readonly PropertyKey[]): CreateTenantFieldErrorKey | null {
  const joinedPath = path
    .filter((segment): segment is string | number => typeof segment === "string" || typeof segment === "number")
    .join(".");

  if (joinedPath in FIELD_ERROR_ALIASES) {
    return FIELD_ERROR_ALIASES[joinedPath];
  }

  if (
    joinedPath === "tenant.displayName" ||
    joinedPath === "tenant.slug" ||
    joinedPath === "owner.fullName" ||
    joinedPath === "owner.phoneNumber" ||
    joinedPath === "owner.email" ||
    joinedPath === "subscription.planCode" ||
    joinedPath === "subscription.billingInterval" ||
    joinedPath === "subscription.renewalMode" ||
    joinedPath === "subscription.status" ||
    joinedPath === "subscription.currencyCode" ||
    joinedPath === "entitlements.maxBranches" ||
    joinedPath === "entitlements.maxInternalUsers" ||
    joinedPath === "entitlements.enabledModules"
  ) {
    return joinedPath;
  }

  return null;
}

export function createDefaultCreateTenantFormValues(now = new Date()): CreateTenantFormValues {
  return {
    tenantDisplayName: "",
    tenantSlug: "",
    ownerFullName: "",
    ownerPhoneNumber: "",
    ownerEmail: "",
    subscriptionPlanCode: "",
    subscriptionStatus: "trialing",
    subscriptionBillingInterval: "monthly",
    subscriptionRenewalMode: "auto",
    subscriptionAmountMajor: "0.00",
    subscriptionCurrencyCode: "USD",
    subscriptionCurrentPeriodStartDate: formatDateInput(now),
    subscriptionCurrentPeriodEndDate: formatDateInput(addDays(now, 30)),
    entitlementsMaxBranches: "1",
    entitlementsMaxInternalUsers: "5",
    entitlementsBookingWebsiteEnabled: false,
    entitlementsEnabledModules: [],
  };
}

export function validateCreateTenantFormValues(
  values: CreateTenantFormValues,
): CreateTenantFormValidationResult {
  const fieldErrors: CreateTenantFieldErrors = {};
  const amountMinor = parseAmountMinor(values.subscriptionAmountMajor, fieldErrors);
  const maxBranches = parseWholeNumber(
    values.entitlementsMaxBranches,
    "entitlements.maxBranches",
    fieldErrors,
  );
  const maxInternalUsers = parseWholeNumber(
    values.entitlementsMaxInternalUsers,
    "entitlements.maxInternalUsers",
    fieldErrors,
  );
  const currentPeriodStartAt = parseDateBoundary(
    values.subscriptionCurrentPeriodStartDate,
    "subscription.currentPeriodStartDate",
    "start",
    fieldErrors,
  );
  const currentPeriodEndAt = parseDateBoundary(
    values.subscriptionCurrentPeriodEndDate,
    "subscription.currentPeriodEndDate",
    "end",
    fieldErrors,
  );

  if (Object.keys(fieldErrors).length > 0) {
    return {
      fieldErrors,
      success: false,
    };
  }

  const payload: CreateTenantInput = {
    tenant: {
      displayName: values.tenantDisplayName,
      slug: values.tenantSlug,
    },
    owner: {
      fullName: values.ownerFullName,
      phoneNumber: values.ownerPhoneNumber,
      email: values.ownerEmail.trim().length > 0 ? values.ownerEmail.trim() : null,
    },
    subscription: {
      planCode: values.subscriptionPlanCode,
      status: values.subscriptionStatus,
      billingInterval: values.subscriptionBillingInterval,
      renewalMode: values.subscriptionRenewalMode,
      amountMinor: amountMinor as number,
      currencyCode: values.subscriptionCurrencyCode,
      currentPeriodStartAt: currentPeriodStartAt as string,
      currentPeriodEndAt: currentPeriodEndAt as string,
      renewsAt:
        values.subscriptionRenewalMode === "auto" ? (currentPeriodEndAt as string) : null,
    },
    entitlements: {
      maxBranches: maxBranches as number,
      maxInternalUsers: maxInternalUsers as number,
      bookingWebsiteEnabled: values.entitlementsBookingWebsiteEnabled,
      enabledModules: values.entitlementsEnabledModules as PlatformEntitlementModuleCode[],
    },
  };

  const validation = createTenantInputSchema.safeParse(payload);

  if (!validation.success) {
    const nextFieldErrors: CreateTenantFieldErrors = {};

    for (const issue of validation.error.issues) {
      const key = toFieldErrorKey(issue.path);

      if (key && !nextFieldErrors[key]) {
        nextFieldErrors[key] = issue.message;
      }
    }

    return {
      fieldErrors: nextFieldErrors,
      success: false,
    };
  }

  return {
    payload: validation.data,
    success: true,
  };
}
