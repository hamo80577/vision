import { z } from "zod";

import {
  platformEntitlementModuleCodes,
  tenantSubscriptionBillingIntervals,
  tenantSubscriptionRenewalModes,
  tenantSubscriptionStatuses,
} from "@vision/contracts";

const slugSchema = z
  .string()
  .trim()
  .min(3)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const displayNameSchema = z.string().trim().min(1).max(120);
const personNameSchema = z.string().trim().min(3).max(120);
const phoneNumberSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9]{7,15}$/);
const emailSchema = z.email().max(255);
const planCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const currencyCodeSchema = z.string().trim().length(3).transform((value) => value.toUpperCase());
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const moduleCodeSchema = z.enum(platformEntitlementModuleCodes);

const tenantIdentitySchema = z
  .object({
    slug: slugSchema,
    displayName: displayNameSchema,
  })
  .strict();

const tenantOwnerInputSchema = z
  .object({
    fullName: personNameSchema,
    phoneNumber: phoneNumberSchema,
    email: emailSchema.nullish(),
  })
  .strict();

const tenantSubscriptionSchema = z
  .object({
    planCode: planCodeSchema,
    billingInterval: z.enum(tenantSubscriptionBillingIntervals),
    renewalMode: z.enum(tenantSubscriptionRenewalModes),
    status: z.enum(tenantSubscriptionStatuses),
    amountMinor: z.number().int().nonnegative(),
    currencyCode: currencyCodeSchema,
    currentPeriodStartAt: isoDateTimeSchema,
    currentPeriodEndAt: isoDateTimeSchema,
    renewsAt: isoDateTimeSchema.nullish().transform((value) => value ?? null),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      new Date(value.currentPeriodEndAt).getTime() <=
      new Date(value.currentPeriodStartAt).getTime()
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["currentPeriodEndAt"],
        message: "currentPeriodEndAt must be after currentPeriodStartAt",
      });
    }
  });

const tenantEntitlementsSchema = z
  .object({
    maxBranches: z.number().int().min(1),
    maxInternalUsers: z.number().int().min(1),
    bookingWebsiteEnabled: z.boolean(),
    enabledModules: z.array(moduleCodeSchema),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.enabledModules).size !== value.enabledModules.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["enabledModules"],
        message: "enabledModules must not contain duplicates",
      });
    }
  });

export const createTenantInputSchema = z
  .object({
    tenant: tenantIdentitySchema,
    owner: tenantOwnerInputSchema,
    subscription: tenantSubscriptionSchema,
    entitlements: tenantEntitlementsSchema,
  })
  .strict();

export const updateTenantSubscriptionInputSchema = tenantSubscriptionSchema;
export const updateTenantEntitlementsInputSchema = tenantEntitlementsSchema;

export const completeOwnerActivationInputSchema = z
  .object({
    password: z.string().min(12).max(128),
    passwordConfirmation: z.string().min(12).max(128),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.password !== value.passwordConfirmation) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["passwordConfirmation"],
        message: "passwordConfirmation must match password",
      });
    }
  });

export type CreateTenantInput = z.infer<typeof createTenantInputSchema>;
export type UpdateTenantSubscriptionInput = z.infer<
  typeof updateTenantSubscriptionInputSchema
>;
export type UpdateTenantEntitlementsInput = z.infer<
  typeof updateTenantEntitlementsInputSchema
>;
export type CompleteOwnerActivationInput = z.infer<
  typeof completeOwnerActivationInputSchema
>;
