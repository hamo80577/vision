"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import type {
  PlatformTenantSummary,
  TenantOnboardingLinkStatus,
  TenantStatus,
} from "@vision/contracts";
import {
  DataTable,
  EmptyState,
  PageHeader,
  SelectField,
  StatusBadge,
  SurfaceCard,
  TableToolbar,
  TextField,
  type DataTableColumn,
} from "@vision/ui";

import {
  onboardingStatusBadge,
  onboardingTone,
  ownerStatusBadge,
  tenantStatusBadge,
  tenantStatusTone,
} from "./status-formatters";
import styles from "./tenant-directory-view.module.css";

type TenantDirectoryViewProps = {
  tenants: PlatformTenantSummary[];
};

type OnboardingFilter = "all" | TenantOnboardingLinkStatus | "not_issued";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function formatMoney(amountMinor: number, currencyCode: string) {
  if (amountMinor === 0) {
    return "No charge";
  }

  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: currencyCode,
  }).format(amountMinor / 100);
}

function onboardingFilterOptions(tenants: PlatformTenantSummary[]) {
  const presentStatuses = new Set<OnboardingFilter>(["not_issued"]);

  for (const tenant of tenants) {
    if (tenant.owner.onboardingLinkStatus) {
      presentStatuses.add(tenant.owner.onboardingLinkStatus);
    } else {
      presentStatuses.add("not_issued");
    }
  }

  return [
    { label: "Onboarding: all", value: "all" },
    ...["issued", "consumed", "expired", "revoked", "not_issued"]
      .filter((status) => presentStatuses.has(status as OnboardingFilter))
      .map((status) => ({
        label:
          status === "not_issued"
            ? "Not issued"
            : onboardingStatusBadge(status as TenantOnboardingLinkStatus),
        value: status,
      })),
  ];
}

function planFilterOptions(tenants: PlatformTenantSummary[]) {
  const uniquePlans = Array.from(new Set(tenants.map((tenant) => tenant.subscription.planCode))).sort();

  return [
    { label: "Plan: all", value: "all" },
    ...uniquePlans.map((planCode) => ({
      label: planCode,
      value: planCode,
    })),
  ];
}

function directoryColumns(): DataTableColumn<PlatformTenantSummary>[] {
  return [
    {
      id: "tenant",
      header: "Tenant",
      cell: (tenant) => (
        <div className={styles.tableCell}>
          <Link className={styles.tableTitleLink} href={`/tenants/${tenant.id}`}>
            {tenant.displayName}
          </Link>
          <span className={styles.tableMeta}>{tenant.slug}</span>
        </div>
      ),
    },
    {
      id: "owner",
      header: "Owner",
      cell: (tenant) => (
        <div className={styles.ownerCell}>
          <span className={styles.ownerAvatar}>
            {tenant.owner.fullName
              .split(" ")
              .map((part) => part[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </span>
          <div className={styles.tableCell}>
            <span className={styles.tableTitle}>{tenant.owner.fullName}</span>
            <span className={styles.tableMeta}>{tenant.owner.phoneNumber}</span>
          </div>
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (tenant) => (
        <div className={styles.statusCell}>
          <StatusBadge tone={tenantStatusTone(tenant.status)}>
            {tenantStatusBadge(tenant.status)}
          </StatusBadge>
          <span className={styles.statusMeta}>Updated {formatDate(tenant.statusChangedAt)}</span>
        </div>
      ),
    },
    {
      id: "subscription",
      header: "Plan",
      cell: (tenant) => (
        <div className={styles.tableCell}>
          <span className={styles.tableTitle}>{tenant.subscription.planCode}</span>
          <span className={styles.tableMeta}>{tenant.subscription.status}</span>
          <span className={styles.tableMeta}>
            {formatMoney(tenant.subscription.amountMinor, tenant.subscription.currencyCode)}
          </span>
        </div>
      ),
    },
    {
      id: "onboarding",
      header: "Onboarding",
      cell: (tenant) => (
        <div className={styles.statusCell}>
          <StatusBadge tone={onboardingTone(tenant.owner.onboardingLinkStatus)}>
            {onboardingStatusBadge(tenant.owner.onboardingLinkStatus)}
          </StatusBadge>
          <span className={styles.tableMeta}>{ownerStatusBadge(tenant.owner.status)}</span>
        </div>
      ),
    },
    {
      id: "access",
      header: "Limits",
      cell: (tenant) => (
        <div className={styles.tableCell}>
          <span className={styles.tableTitle}>
            {tenant.entitlements.maxBranches} branches · {tenant.entitlements.maxInternalUsers} users
          </span>
          <span className={styles.tableMeta}>
            {tenant.entitlements.enabledModules.length} modules
          </span>
          <span className={styles.tableMeta}>
            Website {tenant.entitlements.bookingWebsiteEnabled ? "enabled" : "disabled"}
          </span>
        </div>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: (tenant) => (
        <div className={styles.actionCell}>
          <Link className={styles.tableAction} href={`/tenants/${tenant.id}`}>
            View details
          </Link>
          <Link className={styles.tableAction} href={`/tenants/${tenant.id}/onboarding`}>
            Onboarding
          </Link>
        </div>
      ),
    },
  ];
}

export function TenantDirectoryView({ tenants }: TenantDirectoryViewProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | TenantStatus>("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [onboardingFilter, setOnboardingFilter] = useState<OnboardingFilter>("all");

  const filteredTenants = useMemo(() => {
    return tenants.filter((tenant) => {
      const matchesStatus = statusFilter === "all" || tenant.status === statusFilter;
      const matchesPlan = planFilter === "all" || tenant.subscription.planCode === planFilter;
      const onboardingValue = tenant.owner.onboardingLinkStatus ?? "not_issued";
      const matchesOnboarding = onboardingFilter === "all" || onboardingValue === onboardingFilter;
      const query = search.trim().toLowerCase();
      const matchesQuery =
        query.length === 0 ||
        tenant.displayName.toLowerCase().includes(query) ||
        tenant.slug.toLowerCase().includes(query) ||
        tenant.owner.fullName.toLowerCase().includes(query) ||
        tenant.owner.phoneNumber.toLowerCase().includes(query) ||
        (tenant.owner.email?.toLowerCase().includes(query) ?? false);

      return matchesStatus && matchesPlan && matchesOnboarding && matchesQuery;
    });
  }, [onboardingFilter, planFilter, search, statusFilter, tenants]);

  const activeCount = tenants.filter((tenant) => tenant.status === "active").length;

  return (
    <div className={styles.stack}>
      <PageHeader
        title="Tenant Directory"
        actions={
          <Link className="ui-button" data-size="md" data-variant="primary" href="/tenants/new">
            Create tenant
          </Link>
        }
        badges={<StatusBadge tone="positive">{activeCount} active</StatusBadge>}
      />

      <SurfaceCard className={styles.directoryShell}>
        <div className={styles.directoryFrame}>
          <TableToolbar
            className={styles.toolbar}
          >
            <TextField
              className={styles.toolbarSearch}
              id="tenant-directory-search"
              label="Search"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search tenants, owners, or slugs"
              value={search}
            />
            <SelectField
              className={styles.toolbarFilter}
              id="tenant-directory-status"
              label="Status"
              onChange={(event) => setStatusFilter(event.target.value as "all" | TenantStatus)}
              options={[
                { label: "Status: all", value: "all" },
                { label: "Provisioning", value: "provisioning" },
                { label: "Active", value: "active" },
                { label: "Suspended", value: "suspended" },
              ]}
              value={statusFilter}
            />
            <SelectField
              className={styles.toolbarFilter}
              id="tenant-directory-plan"
              label="Plan"
              onChange={(event) => setPlanFilter(event.target.value)}
              options={planFilterOptions(tenants)}
              value={planFilter}
            />
            <SelectField
              className={styles.toolbarFilter}
              id="tenant-directory-onboarding"
              label="Onboarding"
              onChange={(event) => setOnboardingFilter(event.target.value as OnboardingFilter)}
              options={onboardingFilterOptions(tenants)}
              value={onboardingFilter}
            />
          </TableToolbar>

          {tenants.length === 0 ? (
            <EmptyState
              eyebrow="No tenants"
              title="No tenants yet."
              description="Create the first tenant to begin provisioning."
            />
          ) : filteredTenants.length === 0 ? (
            <EmptyState
              eyebrow="No matches"
              title="No tenants match the current filters."
              description="Broaden the search or clear one of the filters."
            />
          ) : (
            <DataTable
              className={styles.directoryTable}
              columns={directoryColumns()}
              rowKey={(tenant) => tenant.id}
              rows={filteredTenants}
            />
          )}
        </div>
      </SurfaceCard>
    </div>
  );
}
