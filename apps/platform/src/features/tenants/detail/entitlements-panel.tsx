"use client";

import { useEffect, useState, useTransition } from "react";

import {
  platformEntitlementModuleCodes,
  type PlatformEntitlementModuleCode,
  type PlatformTenantDetail,
} from "@vision/contracts";
import {
  Button,
  CheckboxGroup,
  DefinitionGrid,
  InlineNotice,
  SurfaceCard,
  SwitchField,
  TextField,
} from "@vision/ui";

import {
  createEntitlementsFormValues,
  type EntitlementsFieldErrors,
  type EntitlementsFormValues,
} from "./form-values";
import { updateTenantEntitlementsAction } from "./server";
import styles from "./tenant-detail.module.css";

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

type EntitlementsPanelProps = {
  onTenantUpdated: (tenant: PlatformTenantDetail) => void;
  tenant: PlatformTenantDetail;
};

export function EntitlementsPanel({ onTenantUpdated, tenant }: EntitlementsPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(false);
  const [notice, setNotice] = useState<{
    message: string;
    tone: "critical" | "positive";
  } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<EntitlementsFieldErrors>({});
  const [values, setValues] = useState<EntitlementsFormValues>(createEntitlementsFormValues(tenant));

  useEffect(() => {
    setValues(createEntitlementsFormValues(tenant));
    setFieldErrors({});
  }, [tenant]);

  function updateValue<Key extends keyof EntitlementsFormValues>(
    key: Key,
    value: EntitlementsFormValues[Key],
  ) {
    setValues((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function toggleModule(value: string, checked: boolean) {
    const nextValue = value as PlatformEntitlementModuleCode;

    setValues((current) => ({
      ...current,
      enabledModules: checked
        ? current.enabledModules.includes(nextValue)
          ? current.enabledModules
          : [...current.enabledModules, nextValue]
        : current.enabledModules.filter((moduleCode) => moduleCode !== nextValue),
    }));
  }

  function handleSave() {
    startTransition(async () => {
      const result = await updateTenantEntitlementsAction({
        tenantId: tenant.id,
        values,
      });

      if (!result.ok) {
        setFieldErrors(result.fieldErrors);
        setNotice({
          tone: "critical",
          message: result.message,
        });

        return;
      }

      onTenantUpdated(result.tenant);
      setNotice({
        tone: "positive",
        message: result.message,
      });
      setFieldErrors({});
      setIsEditing(false);
    });
  }

  function handleCancel() {
    setValues(createEntitlementsFormValues(tenant));
    setFieldErrors({});
    setNotice(null);
    setIsEditing(false);
  }

  return (
    <SurfaceCard>
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionCopy}>
            <h2 className={styles.sectionTitle}>Limits & modules</h2>
            <p className={styles.sectionDescription}>Stored limits, website access, and enabled modules.</p>
          </div>
          {!isEditing ? (
            <Button onClick={() => setIsEditing(true)} type="button" variant="secondary">
              Edit
            </Button>
          ) : null}
        </div>

        {notice ? <InlineNotice description={notice.message} title="Entitlements saved" tone={notice.tone} /> : null}

        {!isEditing ? (
          <DefinitionGrid
            columns={2}
            items={[
              { label: "Branch limit", value: tenant.entitlements.maxBranches },
              { label: "Internal user limit", value: tenant.entitlements.maxInternalUsers },
              {
                label: "Booking website",
                value: tenant.entitlements.bookingWebsiteEnabled ? "Enabled" : "Disabled",
              },
              {
                label: "Enabled modules",
                value:
                  tenant.entitlements.enabledModules.length > 0
                    ? tenant.entitlements.enabledModules.join(", ")
                    : "No modules",
              },
            ]}
          />
        ) : (
          <>
            <div className={styles.formGrid}>
              <TextField
                error={fieldErrors.maxBranches}
                id="detail-entitlements-max-branches"
                inputMode="numeric"
                label="Branch limit"
                onChange={(event) => updateValue("maxBranches", event.target.value)}
                value={values.maxBranches}
              />
              <TextField
                error={fieldErrors.maxInternalUsers}
                id="detail-entitlements-max-users"
                inputMode="numeric"
                label="Internal user limit"
                onChange={(event) => updateValue("maxInternalUsers", event.target.value)}
                value={values.maxInternalUsers}
              />
              <div className={styles.fieldSpan}>
                <SwitchField
                  checked={values.bookingWebsiteEnabled}
                  description="Controls whether booking website access is enabled."
                  id="detail-booking-website-enabled"
                  label="Booking website enabled"
                  onCheckedChange={(checked) => updateValue("bookingWebsiteEnabled", checked)}
                />
              </div>
              <div className={styles.fieldSpan}>
                <CheckboxGroup
                  hint={fieldErrors.enabledModules}
                  label="Enabled modules"
                  onChange={toggleModule}
                  options={platformEntitlementModuleCodes.map((moduleCode) => ({
                    value: moduleCode,
                    checked: values.enabledModules.includes(moduleCode),
                    label: MODULE_LABELS[moduleCode].label,
                    description: MODULE_LABELS[moduleCode].description,
                  }))}
                />
              </div>
            </div>
            <div className={styles.actionRow}>
              <Button busy={isPending} onClick={handleSave} type="button">
                Save entitlements
              </Button>
              <Button disabled={isPending} onClick={handleCancel} type="button" variant="ghost">
                Cancel
              </Button>
            </div>
          </>
        )}
      </div>
    </SurfaceCard>
  );
}
