import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

import { authSubjects } from "./auth";

export const tenantStatus = pgEnum("tenant_status", [
  "provisioning",
  "active",
  "suspended",
]);

export const tenantOwnerStatus = pgEnum("tenant_owner_status", [
  "invited",
  "activated",
]);

export const tenantSubscriptionStatus = pgEnum("tenant_subscription_status", [
  "trialing",
  "active",
  "past_due",
  "canceled",
]);

export const tenantSubscriptionBillingInterval = pgEnum(
  "tenant_subscription_billing_interval",
  ["monthly", "yearly"],
);

export const tenantSubscriptionRenewalMode = pgEnum(
  "tenant_subscription_renewal_mode",
  ["auto", "manual"],
);

export const platformModuleCode = pgEnum("platform_module_code", [
  "appointments",
  "pos",
  "inventory",
  "tickets",
  "analytics",
]);

export const tenantOnboardingLinkRevocationReason = pgEnum(
  "tenant_onboarding_link_revocation_reason",
  ["reissued", "manually_revoked"],
);

export const platformLifecycleActorType = pgEnum("platform_lifecycle_actor_type", [
  "platform_admin",
  "tenant_owner",
  "system",
]);

export const platformLifecycleEventType = pgEnum("platform_lifecycle_event_type", [
  "tenant_created",
  "owner_invited",
  "owner_invite_reissued",
  "owner_invite_revoked",
  "owner_activated",
  "subscription_initialized",
  "subscription_updated",
  "entitlements_initialized",
  "entitlements_updated",
  "tenant_activated",
  "tenant_suspended",
]);

export const tenants = pgTable(
  "tenants",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    slug: varchar("slug", { length: 128 }).notNull(),
    displayName: varchar("display_name", { length: 120 }).notNull(),
    status: tenantStatus("status").notNull().default("provisioning"),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    slugKey: uniqueIndex("tenants_slug_key").on(table.slug),
  }),
);

export const tenantOwners = pgTable(
  "tenant_owners",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 64 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    authSubjectId: varchar("auth_subject_id", { length: 64 }).references(
      () => authSubjects.id,
    ),
    fullName: varchar("full_name", { length: 120 }).notNull(),
    phoneNumber: varchar("phone_number", { length: 32 }).notNull(),
    normalizedPhoneNumber: varchar("normalized_phone_number", { length: 32 }).notNull(),
    email: varchar("email", { length: 255 }),
    status: tenantOwnerStatus("status").notNull().default("invited"),
    invitedAt: timestamp("invited_at", { withTimezone: true }).notNull().defaultNow(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantOwnerTenantKey: uniqueIndex("tenant_owners_tenant_id_key").on(table.tenantId),
    tenantOwnerAuthSubjectKey: uniqueIndex("tenant_owners_auth_subject_id_key").on(
      table.authSubjectId,
    ),
    tenantOwnerPhoneIdx: index("tenant_owners_normalized_phone_idx").on(
      table.normalizedPhoneNumber,
    ),
  }),
);

export const tenantSubscriptions = pgTable(
  "tenant_subscriptions",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 64 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    planCode: varchar("plan_code", { length: 64 }).notNull(),
    billingInterval: tenantSubscriptionBillingInterval("billing_interval")
      .notNull()
      .default("monthly"),
    renewalMode: tenantSubscriptionRenewalMode("renewal_mode")
      .notNull()
      .default("manual"),
    status: tenantSubscriptionStatus("status").notNull().default("trialing"),
    amountMinor: integer("amount_minor").notNull(),
    currencyCode: varchar("currency_code", { length: 3 }).notNull(),
    currentPeriodStartAt: timestamp("current_period_start_at", {
      withTimezone: true,
    }).notNull(),
    currentPeriodEndAt: timestamp("current_period_end_at", {
      withTimezone: true,
    }).notNull(),
    renewsAt: timestamp("renews_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantSubscriptionTenantKey: uniqueIndex("tenant_subscriptions_tenant_id_key").on(
      table.tenantId,
    ),
    tenantSubscriptionAmountCheck: check(
      "tenant_subscriptions_amount_minor_nonnegative",
      sql`${table.amountMinor} >= 0`,
    ),
    tenantSubscriptionPeriodCheck: check(
      "tenant_subscriptions_period_order_check",
      sql`${table.currentPeriodEndAt} > ${table.currentPeriodStartAt}`,
    ),
  }),
);

export const tenantEntitlements = pgTable(
  "tenant_entitlements",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 64 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    maxBranches: integer("max_branches").notNull(),
    maxInternalUsers: integer("max_internal_users").notNull(),
    bookingWebsiteEnabled: boolean("booking_website_enabled")
      .notNull()
      .default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantEntitlementsTenantKey: uniqueIndex("tenant_entitlements_tenant_id_key").on(
      table.tenantId,
    ),
    tenantEntitlementsBranchLimitCheck: check(
      "tenant_entitlements_max_branches_positive",
      sql`${table.maxBranches} >= 1`,
    ),
    tenantEntitlementsUserLimitCheck: check(
      "tenant_entitlements_max_internal_users_positive",
      sql`${table.maxInternalUsers} >= 1`,
    ),
  }),
);

export const tenantEnabledModules = pgTable(
  "tenant_enabled_modules",
  {
    tenantId: varchar("tenant_id", { length: 64 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    moduleCode: platformModuleCode("module_code").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({
      name: "tenant_enabled_modules_pk",
      columns: [table.tenantId, table.moduleCode],
    }),
  }),
);

export const tenantOnboardingLinks = pgTable(
  "tenant_owner_onboarding_links",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    tenantOwnerId: varchar("tenant_owner_id", { length: 64 })
      .notNull()
      .references(() => tenantOwners.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revocationReason: tenantOnboardingLinkRevocationReason("revocation_reason"),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantOnboardingTokenHashKey: uniqueIndex(
      "tenant_owner_onboarding_links_token_hash_key",
    ).on(table.tokenHash),
    tenantOnboardingOwnerIdx: index("tenant_owner_onboarding_links_owner_idx").on(
      table.tenantOwnerId,
    ),
  }),
);

export const tenantLifecycleEvents = pgTable(
  "tenant_lifecycle_events",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 64 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    actorType: platformLifecycleActorType("actor_type").notNull(),
    actorSubjectId: varchar("actor_subject_id", { length: 64 }).references(
      () => authSubjects.id,
    ),
    eventType: platformLifecycleEventType("event_type").notNull(),
    detail: jsonb("detail")
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantLifecycleTenantIdx: index("tenant_lifecycle_events_tenant_idx").on(
      table.tenantId,
    ),
    tenantLifecycleOccurredIdx: index("tenant_lifecycle_events_occurred_idx").on(
      table.occurredAt,
    ),
  }),
);
