export const tenantStatuses = ["provisioning", "active", "suspended"] as const;
export type TenantStatus = (typeof tenantStatuses)[number];

export const tenantOwnerStatuses = ["invited", "activated"] as const;
export type TenantOwnerStatus = (typeof tenantOwnerStatuses)[number];

export const tenantOnboardingLinkStatuses = ["issued", "revoked", "expired", "consumed"] as const;
export type TenantOnboardingLinkStatus = (typeof tenantOnboardingLinkStatuses)[number];

export const tenantSubscriptionStatuses = ["trialing", "active", "past_due", "canceled"] as const;
export type TenantSubscriptionStatus = (typeof tenantSubscriptionStatuses)[number];

export const tenantSubscriptionBillingIntervals = ["monthly", "yearly"] as const;
export type TenantSubscriptionBillingInterval = (typeof tenantSubscriptionBillingIntervals)[number];

export const tenantSubscriptionRenewalModes = ["auto", "manual"] as const;
export type TenantSubscriptionRenewalMode = (typeof tenantSubscriptionRenewalModes)[number];

export const platformEntitlementModuleCodes = [
  "appointments",
  "pos",
  "inventory",
  "tickets",
  "analytics",
] as const;
export type PlatformEntitlementModuleCode = (typeof platformEntitlementModuleCodes)[number];

export type TenantEntitlementsSnapshot = {
  maxBranches: number;
  maxInternalUsers: number;
  bookingWebsiteEnabled: boolean;
  enabledModules: PlatformEntitlementModuleCode[];
};

export type TenantSubscriptionSnapshot = {
  planCode: string;
  billingInterval: TenantSubscriptionBillingInterval;
  renewalMode: TenantSubscriptionRenewalMode;
  status: TenantSubscriptionStatus;
  amountMinor: number;
  currencyCode: string;
  currentPeriodStartAt: string;
  currentPeriodEndAt: string;
  renewsAt: string | null;
};

export type TenantOwnerSnapshot = {
  fullName: string;
  phoneNumber: string;
  email: string | null;
  status: TenantOwnerStatus;
  onboardingLinkStatus: TenantOnboardingLinkStatus | null;
  onboardingIssuedAt: string | null;
  onboardingExpiresAt: string | null;
};

export type PlatformTenantSummary = {
  id: string;
  slug: string;
  displayName: string;
  status: TenantStatus;
  statusChangedAt: string;
  owner: TenantOwnerSnapshot;
  subscription: TenantSubscriptionSnapshot;
  entitlements: TenantEntitlementsSnapshot;
};

export type TenantLifecycleEvent = {
  id: string;
  eventType:
    | "tenant_created"
    | "owner_invited"
    | "owner_invite_reissued"
    | "owner_invite_revoked"
    | "owner_activated"
    | "subscription_initialized"
    | "subscription_updated"
    | "entitlements_initialized"
    | "entitlements_updated"
    | "tenant_activated"
    | "tenant_suspended";
  actorType: "platform_admin" | "tenant_owner" | "system";
  actorSubjectId: string | null;
  occurredAt: string;
};

export type PlatformTenantDetail = PlatformTenantSummary & {
  lifecycle: TenantLifecycleEvent[];
};

export type IssuedOwnerOnboardingLink = {
  linkId: string;
  activationToken: string;
  activationPath: string;
  issuedAt: string;
  expiresAt: string;
};

export type CreateTenantResult = {
  tenant: PlatformTenantDetail;
  ownerOnboardingLink: IssuedOwnerOnboardingLink;
};

export type CreateTenantInput = {
  tenant: {
    slug: string;
    displayName: string;
  };
  owner: {
    fullName: string;
    phoneNumber: string;
    email?: string | null;
  };
  subscription: TenantSubscriptionSnapshot;
  entitlements: TenantEntitlementsSnapshot;
};

export type UpdateTenantSubscriptionInput = TenantSubscriptionSnapshot;

export type UpdateTenantEntitlementsInput = TenantEntitlementsSnapshot;

export type CompleteOwnerActivationInput = {
  password: string;
  passwordConfirmation: string;
};

export type OwnerActivationView = {
  onboardingLinkStatus: TenantOnboardingLinkStatus;
  expiresAt: string | null;
  tenant: {
    displayName: string;
    slug: string;
  };
  owner: {
    fullName: string;
    maskedPhoneNumber: string;
    maskedEmail: string | null;
  };
};

export type OwnerActivationCompletionResult = {
  subjectId: string;
  challengeId: string;
  challengeToken: string;
  requiredAssurance: "mfa_verified";
  nextStep: "mfa_enrollment_required" | "mfa_verification_required";
  reason: "mfa_enrollment" | "login_mfa";
  expiresAt: string;
  tenant: {
    displayName: string;
    slug: string;
  };
  owner: {
    fullName: string;
    loginIdentifier: string;
  };
};
