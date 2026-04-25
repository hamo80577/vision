"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { platformEntitlementModuleCodes, type PlatformEntitlementModuleCode } from "@vision/contracts";
import {
  Button,
  CheckboxGroup,
  DefinitionGrid,
  InlineNotice,
  PageHeader,
  SelectField,
  StatusBadge,
  SurfaceCard,
  SwitchField,
  TextField,
} from "@vision/ui";

import {
  ownerStatusBadge,
  ownerStatusTone,
  tenantStatusBadge,
  tenantStatusTone,
} from "../status-formatters";
import {
  createDefaultCreateTenantFormValues,
} from "./form-values";
import { createTenantAction } from "./server";
import {
  initialCreateTenantActionState,
  lookupCreateTenantFieldError,
  normalizeCreateTenantActionState,
} from "./state";
import styles from "./create-tenant-form.module.css";

const MODULE_LABELS: Record<PlatformEntitlementModuleCode, { description: string; label: string }> = {
  appointments: {
    label: "Appointments",
    description: "Calendar, scheduling, and appointment operations.",
  },
  pos: {
    label: "POS",
    description: "Checkout and counter sales workflows.",
  },
  inventory: {
    label: "Inventory",
    description: "Stock, product, and movement tracking.",
  },
  tickets: {
    label: "Tickets",
    description: "Support requests and tenant communications.",
  },
  analytics: {
    label: "Analytics",
    description: "Operational and commercial reporting.",
  },
};

type PreviewState = {
  bookingWebsiteEnabled: boolean;
  enabledModules: PlatformEntitlementModuleCode[];
  ownerEmail: string;
  ownerName: string;
  ownerPhone: string;
  planCode: string;
  status: string;
  billingInterval: string;
  displayName: string;
  slug: string;
  maxBranches: string;
  maxInternalUsers: string;
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button busy={pending} size="lg" type="submit">
      Create tenant
    </Button>
  );
}

function createPreviewState(
  defaults: ReturnType<typeof createDefaultCreateTenantFormValues>,
): PreviewState {
  return {
    bookingWebsiteEnabled: defaults.entitlementsBookingWebsiteEnabled,
    enabledModules: defaults.entitlementsEnabledModules as PlatformEntitlementModuleCode[],
    ownerEmail: defaults.ownerEmail,
    ownerName: defaults.ownerFullName,
    ownerPhone: defaults.ownerPhoneNumber,
    planCode: defaults.subscriptionPlanCode,
    status: defaults.subscriptionStatus,
    billingInterval: defaults.subscriptionBillingInterval,
    displayName: defaults.tenantDisplayName,
    slug: defaults.tenantSlug,
    maxBranches: defaults.entitlementsMaxBranches,
    maxInternalUsers: defaults.entitlementsMaxInternalUsers,
  };
}

function readPreviewState(form: HTMLFormElement, fallback: PreviewState): PreviewState {
  const data = new FormData(form);
  const readValue = (name: string, value: string) => {
    const next = data.get(name);

    return typeof next === "string" ? next : value;
  };

  return {
    bookingWebsiteEnabled: data.get("entitlements.bookingWebsiteEnabled") === "on",
    enabledModules:
      data
        .getAll("entitlements.enabledModules")
        .filter((value): value is PlatformEntitlementModuleCode =>
          typeof value === "string" && platformEntitlementModuleCodes.includes(value as PlatformEntitlementModuleCode),
        ),
    ownerEmail: readValue("owner.email", fallback.ownerEmail),
    ownerName: readValue("owner.fullName", fallback.ownerName),
    ownerPhone: readValue("owner.phoneNumber", fallback.ownerPhone),
    planCode: readValue("subscription.planCode", fallback.planCode),
    status: readValue("subscription.status", fallback.status),
    billingInterval: readValue("subscription.billingInterval", fallback.billingInterval),
    displayName: readValue("tenant.displayName", fallback.displayName),
    slug: readValue("tenant.slug", fallback.slug),
    maxBranches: readValue("entitlements.maxBranches", fallback.maxBranches),
    maxInternalUsers: readValue("entitlements.maxInternalUsers", fallback.maxInternalUsers),
  };
}

export function CreateTenantForm() {
  const defaults = useRef(createDefaultCreateTenantFormValues()).current;
  const defaultPreview = useRef(createPreviewState(defaults)).current;
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(
    createTenantAction,
    initialCreateTenantActionState,
  );
  const safeState = useMemo(() => normalizeCreateTenantActionState(state), [state]);
  const formValues = safeState.values;
  const [bookingWebsiteEnabled, setBookingWebsiteEnabled] = useState(
    formValues.entitlementsBookingWebsiteEnabled,
  );
  const [enabledModules, setEnabledModules] = useState<PlatformEntitlementModuleCode[]>(
    formValues.entitlementsEnabledModules as PlatformEntitlementModuleCode[],
  );
  const [preview, setPreview] = useState<PreviewState>(defaultPreview);
  const [copiedInvitePath, setCopiedInvitePath] = useState(false);

  useEffect(() => {
    if (safeState.status !== "validation_error" && safeState.status !== "error") {
      return;
    }

    setBookingWebsiteEnabled(formValues.entitlementsBookingWebsiteEnabled);
    setEnabledModules(formValues.entitlementsEnabledModules as PlatformEntitlementModuleCode[]);
    setPreview(createPreviewState(formValues));
  }, [
    formValues.entitlementsBookingWebsiteEnabled,
    formValues.entitlementsEnabledModules,
    formValues.entitlementsMaxBranches,
    formValues.entitlementsMaxInternalUsers,
    formValues.ownerEmail,
    formValues.ownerFullName,
    formValues.ownerPhoneNumber,
    formValues.subscriptionBillingInterval,
    formValues.subscriptionPlanCode,
    formValues.subscriptionStatus,
    formValues.tenantDisplayName,
    formValues.tenantSlug,
    safeState.status,
  ]);

  useEffect(() => {
    if (safeState.status !== "success") {
      return;
    }

    formRef.current?.reset();
    setBookingWebsiteEnabled(defaults.entitlementsBookingWebsiteEnabled);
    setEnabledModules(defaults.entitlementsEnabledModules as PlatformEntitlementModuleCode[]);
    setPreview(defaultPreview);
    setCopiedInvitePath(false);
  }, [
    defaultPreview,
    defaults.entitlementsBookingWebsiteEnabled,
    defaults.entitlementsEnabledModules,
    safeState.status,
  ]);

  function syncPreviewFromForm() {
    if (!formRef.current) {
      return;
    }

    setPreview(readPreviewState(formRef.current, defaultPreview));
  }

  function toggleModule(value: string, checked: boolean) {
    const nextValue = value as PlatformEntitlementModuleCode;

    setEnabledModules((current) => {
      const nextModules = checked
        ? current.includes(nextValue)
          ? current
          : [...current, nextValue]
        : current.filter((moduleCode) => moduleCode !== nextValue);

      setPreview((currentPreview) => ({
        ...currentPreview,
        enabledModules: nextModules,
      }));

      return nextModules;
    });
  }

  function toggleBookingWebsite(checked: boolean) {
    setBookingWebsiteEnabled(checked);
    setPreview((currentPreview) => ({
      ...currentPreview,
      bookingWebsiteEnabled: checked,
    }));
  }

  async function handleCopyInvitePath() {
    if (!safeState.result) {
      return;
    }

    await navigator.clipboard.writeText(safeState.result.ownerOnboardingLink.activationPath);
    setCopiedInvitePath(true);
  }

  return (
    <div className={styles.stack}>
      <Link className={styles.backLink} href="/tenants">
        Back to tenants
      </Link>

      <PageHeader
        title="Create Tenant"
        description="Provision a new tenant and define starting access."
      />

      {safeState.status === "success" && safeState.result ? (
        <SurfaceCard className={styles.successCard} tone="accent">
          <div className={styles.successStack}>
            <div className={styles.successHeader}>
              <div>
                <p className={styles.successTitle}>{safeState.result.tenant.displayName}</p>
                <p className={styles.successMeta}>Tenant created and owner onboarding is ready.</p>
              </div>
              <div className={styles.badgeRow}>
                <StatusBadge tone={tenantStatusTone(safeState.result.tenant.status)}>
                  {tenantStatusBadge(safeState.result.tenant.status)}
                </StatusBadge>
                <StatusBadge tone={ownerStatusTone(safeState.result.tenant.owner.status)}>
                  {ownerStatusBadge(safeState.result.tenant.owner.status)}
                </StatusBadge>
              </div>
            </div>

            <DefinitionGrid
              columns={3}
              items={[
                { label: "Tenant slug", value: safeState.result.tenant.slug },
                { label: "Plan code", value: safeState.result.tenant.subscription.planCode },
                {
                  label: "Invite expires",
                  value: new Intl.DateTimeFormat("en", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(safeState.result.ownerOnboardingLink.expiresAt)),
                },
              ]}
            />

            <div className={styles.inviteFrame}>
              <p className={styles.inviteLabel}>Owner activation path</p>
              <p className={styles.invitePath}>{safeState.result.ownerOnboardingLink.activationPath}</p>
              <div className={styles.actionRow}>
                <Button onClick={handleCopyInvitePath} type="button" variant="secondary">
                  {copiedInvitePath ? "Copied" : "Copy activation path"}
                </Button>
                <Link
                  className="ui-button"
                  data-size="md"
                  data-variant="primary"
                  href={`/tenants/${safeState.result.tenant.id}`}
                >
                  Open tenant
                </Link>
                <Link
                  className="ui-button"
                  data-size="md"
                  data-variant="ghost"
                  href={`/tenants/${safeState.result.tenant.id}/onboarding`}
                >
                  Manage onboarding
                </Link>
              </div>
            </div>
          </div>
        </SurfaceCard>
      ) : null}

      {safeState.submitError ? (
        <InlineNotice
          tone={safeState.status === "validation_error" ? "warning" : "critical"}
          title={safeState.status === "validation_error" ? "Check the form details." : "Tenant could not be created."}
          description={safeState.submitError}
        />
      ) : null}

      <form
        action={formAction}
        className={styles.form}
        onChange={syncPreviewFromForm}
        onInput={syncPreviewFromForm}
        ref={formRef}
      >
        <div className={styles.layout}>
          <div className={styles.mainColumn}>
            <SurfaceCard>
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h2 className={styles.sectionTitle}>Tenant identity</h2>
                  <p className={styles.sectionDescription}>Business name and routing values.</p>
                </div>
                <div className={styles.formGrid}>
                  <TextField
                    defaultValue={formValues.tenantDisplayName}
                    key={`tenant-display-name-${safeState.status}-${formValues.tenantDisplayName}`}
                    error={lookupCreateTenantFieldError(safeState.fieldErrors, "tenant.displayName")}
                    id="tenant-display-name"
                    label="Display name"
                    name="tenant.displayName"
                    placeholder="North Coast Spa"
                  />
                  <TextField
                    defaultValue={formValues.tenantSlug}
                    key={`tenant-slug-${safeState.status}-${formValues.tenantSlug}`}
                    error={lookupCreateTenantFieldError(safeState.fieldErrors, "tenant.slug")}
                    id="tenant-slug"
                    hint="vision.app/"
                    label="Slug"
                    name="tenant.slug"
                    placeholder="north-coast-spa"
                  />
                </div>
              </div>
            </SurfaceCard>

            <SurfaceCard>
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h2 className={styles.sectionTitle}>Owner setup</h2>
                  <p className={styles.sectionDescription}>Primary owner contact for first access.</p>
                </div>
                <div className={styles.formGrid}>
                  <TextField
                    defaultValue={formValues.ownerFullName}
                    key={`owner-full-name-${safeState.status}-${formValues.ownerFullName}`}
                    error={lookupCreateTenantFieldError(safeState.fieldErrors, "owner.fullName")}
                    id="owner-full-name"
                    label="Full name"
                    name="owner.fullName"
                    placeholder="Mariam Adel"
                  />
                  <TextField
                    defaultValue={formValues.ownerPhoneNumber}
                    key={`owner-phone-number-${safeState.status}-${formValues.ownerPhoneNumber}`}
                    error={lookupCreateTenantFieldError(safeState.fieldErrors, "owner.phoneNumber")}
                    id="owner-phone-number"
                    label="Phone number"
                    name="owner.phoneNumber"
                    placeholder="+201001112223"
                  />
                  <TextField
                    className={styles.fieldSpan}
                    defaultValue={formValues.ownerEmail}
                    key={`owner-email-${safeState.status}-${formValues.ownerEmail}`}
                    error={lookupCreateTenantFieldError(safeState.fieldErrors, "owner.email")}
                    id="owner-email"
                    label="Email"
                    name="owner.email"
                    placeholder="owner@example.com"
                    type="email"
                  />
                </div>
              </div>
            </SurfaceCard>

            <SurfaceCard>
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h2 className={styles.sectionTitle}>Plan selection</h2>
                  <p className={styles.sectionDescription}>Commercial settings stored on the subscription.</p>
                </div>
                <div className={styles.formGrid}>
                  <TextField
                    defaultValue={formValues.subscriptionPlanCode}
                    key={`subscription-plan-code-${safeState.status}-${formValues.subscriptionPlanCode}`}
                    error={lookupCreateTenantFieldError(safeState.fieldErrors, "subscription.planCode")}
                    id="subscription-plan-code"
                    label="Plan code"
                    name="subscription.planCode"
                    placeholder="core-monthly"
                  />
                  <TextField
                    defaultValue={formValues.subscriptionAmountMajor}
                    key={`subscription-amount-${safeState.status}-${formValues.subscriptionAmountMajor}`}
                    error={lookupCreateTenantFieldError(safeState.fieldErrors, "subscription.amountMajor")}
                    id="subscription-amount"
                    inputMode="decimal"
                    label="Amount"
                    name="subscription.amountMajor"
                    placeholder="0.00"
                  />
                  <TextField
                    defaultValue={formValues.subscriptionCurrencyCode}
                    key={`subscription-currency-code-${safeState.status}-${formValues.subscriptionCurrencyCode}`}
                    error={lookupCreateTenantFieldError(safeState.fieldErrors, "subscription.currencyCode")}
                    id="subscription-currency-code"
                    label="Currency"
                    name="subscription.currencyCode"
                    placeholder="USD"
                  />
                  <SelectField
                    defaultValue={formValues.subscriptionStatus}
                    key={`subscription-status-${safeState.status}-${formValues.subscriptionStatus}`}
                    error={lookupCreateTenantFieldError(safeState.fieldErrors, "subscription.status")}
                    id="subscription-status"
                    label="Status"
                    name="subscription.status"
                    options={[
                      { label: "Trialing", value: "trialing" },
                      { label: "Active", value: "active" },
                      { label: "Past due", value: "past_due" },
                      { label: "Canceled", value: "canceled" },
                    ]}
                  />
                  <SelectField
                    defaultValue={formValues.subscriptionBillingInterval}
                    key={`subscription-billing-interval-${safeState.status}-${formValues.subscriptionBillingInterval}`}
                    error={lookupCreateTenantFieldError(safeState.fieldErrors, "subscription.billingInterval")}
                    id="subscription-billing-interval"
                    label="Billing interval"
                    name="subscription.billingInterval"
                    options={[
                      { label: "Monthly", value: "monthly" },
                      { label: "Yearly", value: "yearly" },
                    ]}
                  />
                  <SelectField
                    defaultValue={formValues.subscriptionRenewalMode}
                    key={`subscription-renewal-mode-${safeState.status}-${formValues.subscriptionRenewalMode}`}
                    error={lookupCreateTenantFieldError(safeState.fieldErrors, "subscription.renewalMode")}
                    id="subscription-renewal-mode"
                    label="Renewal mode"
                    name="subscription.renewalMode"
                    options={[
                      { label: "Auto", value: "auto" },
                      { label: "Manual", value: "manual" },
                    ]}
                  />
                  <TextField
                    defaultValue={formValues.subscriptionCurrentPeriodStartDate}
                    key={`subscription-period-start-${safeState.status}-${formValues.subscriptionCurrentPeriodStartDate}`}
                    error={lookupCreateTenantFieldError(safeState.fieldErrors, "subscription.currentPeriodStartDate")}
                    id="subscription-period-start"
                    label="Current period starts"
                    name="subscription.currentPeriodStartDate"
                    type="date"
                  />
                  <TextField
                    defaultValue={formValues.subscriptionCurrentPeriodEndDate}
                    key={`subscription-period-end-${safeState.status}-${formValues.subscriptionCurrentPeriodEndDate}`}
                    error={lookupCreateTenantFieldError(safeState.fieldErrors, "subscription.currentPeriodEndDate")}
                    id="subscription-period-end"
                    label="Current period ends"
                    name="subscription.currentPeriodEndDate"
                    type="date"
                  />
                </div>
              </div>
            </SurfaceCard>

            <SurfaceCard>
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h2 className={styles.sectionTitle}>Entitlements & activation</h2>
                  <p className={styles.sectionDescription}>Stored limits, modules, and website access.</p>
                </div>
                <div className={styles.formGrid}>
                  <TextField
                    defaultValue={formValues.entitlementsMaxBranches}
                    key={`entitlements-max-branches-${safeState.status}-${formValues.entitlementsMaxBranches}`}
                    error={lookupCreateTenantFieldError(safeState.fieldErrors, "entitlements.maxBranches")}
                    id="entitlements-max-branches"
                    inputMode="numeric"
                    label="Branch limit"
                    name="entitlements.maxBranches"
                  />
                  <TextField
                    defaultValue={formValues.entitlementsMaxInternalUsers}
                    key={`entitlements-max-internal-users-${safeState.status}-${formValues.entitlementsMaxInternalUsers}`}
                    error={lookupCreateTenantFieldError(safeState.fieldErrors, "entitlements.maxInternalUsers")}
                    id="entitlements-max-internal-users"
                    inputMode="numeric"
                    label="Internal user limit"
                    name="entitlements.maxInternalUsers"
                  />
                  <div className={styles.fieldSpan}>
                    <SwitchField
                      checked={bookingWebsiteEnabled}
                      description="Enable or disable booking website access."
                      id="booking-website-enabled"
                      label="Booking website enabled"
                      name="entitlements.bookingWebsiteEnabled"
                      onCheckedChange={toggleBookingWebsite}
                    />
                  </div>
                  <div className={styles.fieldSpan}>
                    <CheckboxGroup
                      hint={lookupCreateTenantFieldError(safeState.fieldErrors, "entitlements.enabledModules")}
                      label="Enabled modules"
                      name="entitlements.enabledModules"
                      onChange={toggleModule}
                      options={platformEntitlementModuleCodes.map((moduleCode) => ({
                        value: moduleCode,
                        checked: enabledModules.includes(moduleCode),
                        label: MODULE_LABELS[moduleCode].label,
                        description: MODULE_LABELS[moduleCode].description,
                      }))}
                    />
                  </div>
                </div>
              </div>
            </SurfaceCard>
          </div>

          <div className={styles.sideColumn}>
            <SurfaceCard className={styles.summaryCard} tone="muted">
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h2 className={styles.sectionTitle}>Provisioning summary</h2>
                  <p className={styles.sectionDescription}>Review the starting record before submit.</p>
                </div>

                <div className={styles.summaryGroups}>
                  <div className={styles.summaryGroup}>
                    <p className={styles.summaryLabel}>Tenant</p>
                    <p className={styles.summaryValue}>
                      {preview.displayName || "Display name pending"}
                    </p>
                    <p className={styles.summaryMeta}>
                      {preview.slug ? `vision.app/${preview.slug}` : "Slug pending"}
                    </p>
                  </div>

                  <div className={styles.summaryGroup}>
                    <p className={styles.summaryLabel}>Owner</p>
                    <p className={styles.summaryValue}>{preview.ownerName || "Owner pending"}</p>
                    <p className={styles.summaryMeta}>
                      {preview.ownerEmail || preview.ownerPhone || "Contact pending"}
                    </p>
                  </div>

                  <div className={styles.summaryGroup}>
                    <p className={styles.summaryLabel}>Plan</p>
                    <p className={styles.summaryValue}>{preview.planCode || "Plan pending"}</p>
                    <p className={styles.summaryMeta}>
                      {preview.status} · {preview.billingInterval}
                    </p>
                  </div>
                </div>

                <DefinitionGrid
                  columns={2}
                  items={[
                    { label: "Branches", value: preview.maxBranches || "0" },
                    { label: "Users", value: preview.maxInternalUsers || "0" },
                    {
                      label: "Website",
                      value: preview.bookingWebsiteEnabled ? "Enabled" : "Disabled",
                    },
                    {
                      label: "Modules",
                      value: preview.enabledModules.length > 0 ? preview.enabledModules.length : "None",
                    },
                  ]}
                />

                <div className={styles.moduleSummary}>
                  <p className={styles.summaryLabel}>Enabled modules</p>
                  <div className={styles.summaryBadgeRow}>
                    {preview.enabledModules.length > 0 ? (
                      preview.enabledModules.map((moduleCode) => (
                        <StatusBadge key={moduleCode} tone="neutral">
                          {MODULE_LABELS[moduleCode].label}
                        </StatusBadge>
                      ))
                    ) : (
                      <StatusBadge tone="neutral">No modules selected</StatusBadge>
                    )}
                  </div>
                </div>

                <div className={styles.sidebarActions}>
                  <SubmitButton />
                  <Link className="ui-button" data-size="lg" data-variant="ghost" href="/tenants">
                    Cancel
                  </Link>
                </div>
              </div>
            </SurfaceCard>
          </div>
        </div>
      </form>
    </div>
  );
}
