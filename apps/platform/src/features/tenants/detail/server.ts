"use server";

import { revalidatePath } from "next/cache";

import type {
  IssuedOwnerOnboardingLink,
  PlatformTenantDetail,
  UpdateTenantEntitlementsInput,
  UpdateTenantSubscriptionInput,
} from "@vision/contracts";

import { fetchPlatformApi, mutatePlatformApi, PlatformApiError } from "../../../lib/platform-api";
import {
  type EntitlementsFieldErrors,
  type EntitlementsFormValues,
  type SubscriptionFieldErrors,
  type SubscriptionFormValues,
  validateEntitlementsFormValues,
  validateSubscriptionFormValues,
} from "./form-values";

type TenantMutationSuccess = {
  ok: true;
  message: string;
  tenant: PlatformTenantDetail;
};

type TenantMutationFailure = {
  message: string;
  ok: false;
};

export type UpdateSubscriptionResult =
  | TenantMutationSuccess
  | (TenantMutationFailure & {
      fieldErrors: SubscriptionFieldErrors;
    });

export type UpdateEntitlementsResult =
  | TenantMutationSuccess
  | (TenantMutationFailure & {
      fieldErrors: EntitlementsFieldErrors;
    });

export type TenantActionResult = TenantMutationSuccess | TenantMutationFailure;

export type ReissueOnboardingResult =
  | (TenantMutationSuccess & {
      ownerOnboardingLink: IssuedOwnerOnboardingLink;
    })
  | TenantMutationFailure;

function revalidateTenantRoutes(tenantId: string) {
  revalidatePath("/tenants");
  revalidatePath(`/tenants/${tenantId}`);
}

function toFailure(error: unknown, fallback: string): TenantMutationFailure {
  if (error instanceof PlatformApiError) {
    return {
      ok: false,
      message: error.message,
    };
  }

  return {
    ok: false,
    message: fallback,
  };
}

export async function updateTenantSubscriptionAction(input: {
  tenantId: string;
  values: SubscriptionFormValues;
}): Promise<UpdateSubscriptionResult> {
  const validation = validateSubscriptionFormValues(input.values);

  if (!validation.success) {
    return {
      ok: false,
      message: "Review the subscription fields and try again.",
      fieldErrors: validation.fieldErrors,
    };
  }

  try {
    const tenant = await mutatePlatformApi<PlatformTenantDetail, UpdateTenantSubscriptionInput>({
      method: "PUT",
      path: `/platform/tenants/${input.tenantId}/subscription`,
      body: validation.payload,
    });

    revalidateTenantRoutes(input.tenantId);

    return {
      ok: true,
      tenant,
      message: "Subscription saved.",
    };
  } catch (error) {
    return {
      ...toFailure(error, "Subscription could not be updated."),
      fieldErrors: {},
    };
  }
}

export async function updateTenantEntitlementsAction(input: {
  tenantId: string;
  values: EntitlementsFormValues;
}): Promise<UpdateEntitlementsResult> {
  const validation = validateEntitlementsFormValues(input.values);

  if (!validation.success) {
    return {
      ok: false,
      message: "Review the entitlement fields and try again.",
      fieldErrors: validation.fieldErrors,
    };
  }

  try {
    const tenant = await mutatePlatformApi<PlatformTenantDetail, UpdateTenantEntitlementsInput>({
      method: "PUT",
      path: `/platform/tenants/${input.tenantId}/entitlements`,
      body: validation.payload,
    });

    revalidateTenantRoutes(input.tenantId);

    return {
      ok: true,
      tenant,
      message: "Entitlements saved.",
    };
  } catch (error) {
    return {
      ...toFailure(error, "Entitlements could not be updated."),
      fieldErrors: {},
    };
  }
}

export async function activateTenantAction(input: {
  tenantId: string;
}): Promise<TenantActionResult> {
  try {
    const tenant = await mutatePlatformApi<PlatformTenantDetail, Record<string, never>>({
      method: "POST",
      path: `/platform/tenants/${input.tenantId}/activate`,
      body: {},
    });

    revalidateTenantRoutes(input.tenantId);

    return {
      ok: true,
      tenant,
      message: "Tenant active.",
    };
  } catch (error) {
    return toFailure(error, "Tenant could not be activated.");
  }
}

export async function suspendTenantAction(input: {
  tenantId: string;
}): Promise<TenantActionResult> {
  try {
    const tenant = await mutatePlatformApi<PlatformTenantDetail, Record<string, never>>({
      method: "POST",
      path: `/platform/tenants/${input.tenantId}/suspend`,
      body: {},
    });

    revalidateTenantRoutes(input.tenantId);

    return {
      ok: true,
      tenant,
      message: "Tenant suspended.",
    };
  } catch (error) {
    return toFailure(error, "Tenant could not be suspended.");
  }
}

export async function reissueOwnerOnboardingLinkAction(input: {
  tenantId: string;
}): Promise<ReissueOnboardingResult> {
  try {
    const ownerOnboardingLink = await mutatePlatformApi<
      IssuedOwnerOnboardingLink,
      Record<string, never>
    >({
      method: "POST",
      path: `/platform/tenants/${input.tenantId}/owner-onboarding-links`,
      body: {},
    });
    const tenant = await fetchPlatformApi<PlatformTenantDetail>(
      `/platform/tenants/${input.tenantId}`,
    );

    revalidateTenantRoutes(input.tenantId);

    return {
      ok: true,
      tenant,
      ownerOnboardingLink,
      message: "New activation link issued.",
    };
  } catch (error) {
    return toFailure(error, "Owner onboarding link could not be reissued.");
  }
}
