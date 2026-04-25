"use client";

import { useEffect, useState, useTransition } from "react";

import type { PlatformTenantDetail } from "@vision/contracts";
import { Button, DefinitionGrid, InlineNotice, SelectField, SurfaceCard, TextField } from "@vision/ui";

import {
  createSubscriptionFormValues,
  type SubscriptionFieldErrors,
  type SubscriptionFormValues,
} from "./form-values";
import { formatDate, formatMoney } from "./formatters";
import { updateTenantSubscriptionAction } from "./server";
import styles from "./tenant-detail.module.css";

type SubscriptionPanelProps = {
  onTenantUpdated: (tenant: PlatformTenantDetail) => void;
  tenant: PlatformTenantDetail;
};

export function SubscriptionPanel({ onTenantUpdated, tenant }: SubscriptionPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(false);
  const [notice, setNotice] = useState<{
    message: string;
    tone: "critical" | "positive";
  } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<SubscriptionFieldErrors>({});
  const [values, setValues] = useState<SubscriptionFormValues>(createSubscriptionFormValues(tenant));

  useEffect(() => {
    setValues(createSubscriptionFormValues(tenant));
    setFieldErrors({});
  }, [tenant]);

  function updateValue<Key extends keyof SubscriptionFormValues>(
    key: Key,
    value: SubscriptionFormValues[Key],
  ) {
    setValues((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function handleSave() {
    startTransition(async () => {
      const result = await updateTenantSubscriptionAction({
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
    setValues(createSubscriptionFormValues(tenant));
    setFieldErrors({});
    setNotice(null);
    setIsEditing(false);
  }

  return (
    <SurfaceCard>
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionCopy}>
            <h2 className={styles.sectionTitle}>Subscription state</h2>
            <p className={styles.sectionDescription}>Plan, billing interval, and renewal state.</p>
          </div>
          {!isEditing ? (
            <Button onClick={() => setIsEditing(true)} type="button" variant="secondary">
              Edit
            </Button>
          ) : null}
        </div>

        {notice ? <InlineNotice description={notice.message} title="Subscription saved" tone={notice.tone} /> : null}

        {!isEditing ? (
          <DefinitionGrid
            columns={2}
            items={[
              { label: "Plan code", value: tenant.subscription.planCode },
              { label: "Status", value: tenant.subscription.status },
              { label: "Billing interval", value: tenant.subscription.billingInterval },
              { label: "Renewal mode", value: tenant.subscription.renewalMode },
              {
                label: "Amount",
                value: formatMoney(tenant.subscription.amountMinor, tenant.subscription.currencyCode),
              },
              { label: "Period starts", value: formatDate(tenant.subscription.currentPeriodStartAt) },
              { label: "Period ends", value: formatDate(tenant.subscription.currentPeriodEndAt) },
              {
                label: "Renews at",
                value: tenant.subscription.renewsAt ? formatDate(tenant.subscription.renewsAt) : "Manual renewal",
              },
            ]}
          />
        ) : (
          <>
            <div className={styles.formGrid}>
              <TextField
                error={fieldErrors.planCode}
                id="detail-subscription-plan-code"
                label="Plan code"
                onChange={(event) => updateValue("planCode", event.target.value)}
                value={values.planCode}
              />
              <TextField
                error={fieldErrors.amountMajor}
                id="detail-subscription-amount"
                inputMode="decimal"
                label="Amount"
                onChange={(event) => updateValue("amountMajor", event.target.value)}
                value={values.amountMajor}
              />
              <TextField
                error={fieldErrors.currencyCode}
                id="detail-subscription-currency"
                label="Currency"
                onChange={(event) => updateValue("currencyCode", event.target.value)}
                value={values.currencyCode}
              />
              <SelectField
                error={fieldErrors.status}
                id="detail-subscription-status"
                label="Status"
                onChange={(event) =>
                  updateValue("status", event.target.value as SubscriptionFormValues["status"])
                }
                options={[
                  { label: "Trialing", value: "trialing" },
                  { label: "Active", value: "active" },
                  { label: "Past due", value: "past_due" },
                  { label: "Canceled", value: "canceled" },
                ]}
                value={values.status}
              />
              <SelectField
                error={fieldErrors.billingInterval}
                id="detail-subscription-interval"
                label="Billing interval"
                onChange={(event) =>
                  updateValue(
                    "billingInterval",
                    event.target.value as SubscriptionFormValues["billingInterval"],
                  )
                }
                options={[
                  { label: "Monthly", value: "monthly" },
                  { label: "Yearly", value: "yearly" },
                ]}
                value={values.billingInterval}
              />
              <SelectField
                error={fieldErrors.renewalMode}
                id="detail-subscription-renewal"
                label="Renewal mode"
                onChange={(event) =>
                  updateValue(
                    "renewalMode",
                    event.target.value as SubscriptionFormValues["renewalMode"],
                  )
                }
                options={[
                  { label: "Auto", value: "auto" },
                  { label: "Manual", value: "manual" },
                ]}
                value={values.renewalMode}
              />
              <TextField
                error={fieldErrors.currentPeriodStartDate}
                id="detail-subscription-start"
                label="Current period starts"
                onChange={(event) => updateValue("currentPeriodStartDate", event.target.value)}
                type="date"
                value={values.currentPeriodStartDate}
              />
              <TextField
                error={fieldErrors.currentPeriodEndDate}
                id="detail-subscription-end"
                label="Current period ends"
                onChange={(event) => updateValue("currentPeriodEndDate", event.target.value)}
                type="date"
                value={values.currentPeriodEndDate}
              />
            </div>
            <div className={styles.actionRow}>
              <Button busy={isPending} onClick={handleSave} type="button">
                Save subscription
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
