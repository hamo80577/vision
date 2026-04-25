CREATE TYPE "public"."platform_lifecycle_actor_type" AS ENUM('platform_admin', 'tenant_owner', 'system');--> statement-breakpoint
CREATE TYPE "public"."platform_lifecycle_event_type" AS ENUM('tenant_created', 'owner_invited', 'owner_invite_reissued', 'owner_invite_revoked', 'owner_activated', 'subscription_initialized', 'subscription_updated', 'entitlements_initialized', 'entitlements_updated', 'tenant_activated', 'tenant_suspended');--> statement-breakpoint
CREATE TYPE "public"."platform_module_code" AS ENUM('appointments', 'pos', 'inventory', 'tickets', 'analytics');--> statement-breakpoint
CREATE TYPE "public"."tenant_onboarding_link_revocation_reason" AS ENUM('reissued', 'manually_revoked');--> statement-breakpoint
CREATE TYPE "public"."tenant_owner_status" AS ENUM('invited', 'activated');--> statement-breakpoint
CREATE TYPE "public"."tenant_status" AS ENUM('provisioning', 'active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."tenant_subscription_billing_interval" AS ENUM('monthly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."tenant_subscription_renewal_mode" AS ENUM('auto', 'manual');--> statement-breakpoint
CREATE TYPE "public"."tenant_subscription_status" AS ENUM('trialing', 'active', 'past_due', 'canceled');--> statement-breakpoint
CREATE TABLE "tenant_enabled_modules" (
	"tenant_id" varchar(64) NOT NULL,
	"module_code" "platform_module_code" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_enabled_modules_pk" PRIMARY KEY("tenant_id","module_code")
);
--> statement-breakpoint
CREATE TABLE "tenant_entitlements" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(64) NOT NULL,
	"max_branches" integer NOT NULL,
	"max_internal_users" integer NOT NULL,
	"booking_website_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_entitlements_max_branches_positive" CHECK ("tenant_entitlements"."max_branches" >= 1),
	CONSTRAINT "tenant_entitlements_max_internal_users_positive" CHECK ("tenant_entitlements"."max_internal_users" >= 1)
);
--> statement-breakpoint
CREATE TABLE "tenant_lifecycle_events" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(64) NOT NULL,
	"actor_type" "platform_lifecycle_actor_type" NOT NULL,
	"actor_subject_id" varchar(64),
	"event_type" "platform_lifecycle_event_type" NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_owner_onboarding_links" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"tenant_owner_id" varchar(64) NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revocation_reason" "tenant_onboarding_link_revocation_reason",
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_owners" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(64) NOT NULL,
	"auth_subject_id" varchar(64),
	"full_name" varchar(120) NOT NULL,
	"phone_number" varchar(32) NOT NULL,
	"normalized_phone_number" varchar(32) NOT NULL,
	"email" varchar(255),
	"status" "tenant_owner_status" DEFAULT 'invited' NOT NULL,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_subscriptions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(64) NOT NULL,
	"plan_code" varchar(64) NOT NULL,
	"billing_interval" "tenant_subscription_billing_interval" DEFAULT 'monthly' NOT NULL,
	"renewal_mode" "tenant_subscription_renewal_mode" DEFAULT 'manual' NOT NULL,
	"status" "tenant_subscription_status" DEFAULT 'trialing' NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency_code" varchar(3) NOT NULL,
	"current_period_start_at" timestamp with time zone NOT NULL,
	"current_period_end_at" timestamp with time zone NOT NULL,
	"renews_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_subscriptions_amount_minor_nonnegative" CHECK ("tenant_subscriptions"."amount_minor" >= 0),
	CONSTRAINT "tenant_subscriptions_period_order_check" CHECK ("tenant_subscriptions"."current_period_end_at" > "tenant_subscriptions"."current_period_start_at")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"slug" varchar(128) NOT NULL,
	"display_name" varchar(120) NOT NULL,
	"status" "tenant_status" DEFAULT 'provisioning' NOT NULL,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_enabled_modules" ADD CONSTRAINT "tenant_enabled_modules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_entitlements" ADD CONSTRAINT "tenant_entitlements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_lifecycle_events" ADD CONSTRAINT "tenant_lifecycle_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_lifecycle_events" ADD CONSTRAINT "tenant_lifecycle_events_actor_subject_id_auth_subjects_id_fk" FOREIGN KEY ("actor_subject_id") REFERENCES "public"."auth_subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_owner_onboarding_links" ADD CONSTRAINT "tenant_owner_onboarding_links_tenant_owner_id_tenant_owners_id_fk" FOREIGN KEY ("tenant_owner_id") REFERENCES "public"."tenant_owners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_owners" ADD CONSTRAINT "tenant_owners_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_owners" ADD CONSTRAINT "tenant_owners_auth_subject_id_auth_subjects_id_fk" FOREIGN KEY ("auth_subject_id") REFERENCES "public"."auth_subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_subscriptions" ADD CONSTRAINT "tenant_subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_entitlements_tenant_id_key" ON "tenant_entitlements" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tenant_lifecycle_events_tenant_idx" ON "tenant_lifecycle_events" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tenant_lifecycle_events_occurred_idx" ON "tenant_lifecycle_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_owner_onboarding_links_token_hash_key" ON "tenant_owner_onboarding_links" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "tenant_owner_onboarding_links_owner_idx" ON "tenant_owner_onboarding_links" USING btree ("tenant_owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_owners_tenant_id_key" ON "tenant_owners" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_owners_auth_subject_id_key" ON "tenant_owners" USING btree ("auth_subject_id");--> statement-breakpoint
CREATE INDEX "tenant_owners_normalized_phone_idx" ON "tenant_owners" USING btree ("normalized_phone_number");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_subscriptions_tenant_id_key" ON "tenant_subscriptions" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants" USING btree ("slug");--> statement-breakpoint
CREATE OR REPLACE FUNCTION "public"."create_tenant_owner_auth_subject"(
  "p_id" varchar,
  "p_login_identifier" text,
  "p_normalized_login_identifier" text,
  "p_password_hash" text,
  "p_password_updated_at" timestamp with time zone,
  "p_created_at" timestamp with time zone,
  "p_updated_at" timestamp with time zone
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.auth_subjects (
    id,
    subject_type,
    login_identifier,
    normalized_login_identifier,
    password_hash,
    password_updated_at,
    internal_sensitivity,
    is_enabled,
    created_at,
    updated_at
  )
  VALUES (
    p_id,
    'internal'::public.auth_subject_type,
    p_login_identifier,
    p_normalized_login_identifier,
    p_password_hash,
    p_password_updated_at,
    'tenant_owner'::public.auth_internal_sensitivity,
    true,
    p_created_at,
    p_updated_at
  );
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."create_tenant_owner_auth_subject"(varchar, text, text, text, timestamp with time zone, timestamp with time zone, timestamp with time zone) FROM PUBLIC;
