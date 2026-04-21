CREATE TYPE "public"."auth_assurance_challenge_reason" AS ENUM('login_mfa', 'mfa_enrollment', 'tenant_context_switch', 'support_grant_activation', 'website_management_write', 'data_export', 'credential_reset');--> statement-breakpoint
CREATE TYPE "public"."auth_internal_sensitivity" AS ENUM('none', 'platform_admin', 'tenant_owner', 'branch_manager');--> statement-breakpoint
ALTER TYPE "public"."auth_account_event_type" ADD VALUE 'mfa_enrollment_started';--> statement-breakpoint
ALTER TYPE "public"."auth_account_event_type" ADD VALUE 'mfa_enrollment_completed';--> statement-breakpoint
ALTER TYPE "public"."auth_account_event_type" ADD VALUE 'mfa_challenge_created';--> statement-breakpoint
ALTER TYPE "public"."auth_account_event_type" ADD VALUE 'mfa_challenge_failed';--> statement-breakpoint
ALTER TYPE "public"."auth_account_event_type" ADD VALUE 'mfa_verified';--> statement-breakpoint
ALTER TYPE "public"."auth_account_event_type" ADD VALUE 'backup_code_used';--> statement-breakpoint
ALTER TYPE "public"."auth_account_event_type" ADD VALUE 'backup_codes_regenerated';--> statement-breakpoint
ALTER TYPE "public"."auth_account_event_type" ADD VALUE 'step_up_started';--> statement-breakpoint
ALTER TYPE "public"."auth_account_event_type" ADD VALUE 'step_up_verified';--> statement-breakpoint
ALTER TYPE "public"."auth_account_event_type" ADD VALUE 'assurance_denied';--> statement-breakpoint
ALTER TYPE "public"."auth_assurance_level" ADD VALUE 'mfa_verified';--> statement-breakpoint
ALTER TYPE "public"."auth_assurance_level" ADD VALUE 'step_up_verified';--> statement-breakpoint
CREATE TABLE "auth_assurance_challenges" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"subject_id" varchar(64) NOT NULL,
	"session_id" varchar(64),
	"required_assurance" "auth_assurance_level" NOT NULL,
	"reason" "auth_assurance_challenge_reason" NOT NULL,
	"secret_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"invalidated_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_mfa_backup_codes" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"subject_id" varchar(64) NOT NULL,
	"batch_id" varchar(64) NOT NULL,
	"code_hash" text NOT NULL,
	"ordinal" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "auth_mfa_totp_factors" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"subject_id" varchar(64) NOT NULL,
	"encrypted_secret" text NOT NULL,
	"encryption_key_version" varchar(32) NOT NULL,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_at" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN "assurance_updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_subjects" ADD COLUMN "internal_sensitivity" "auth_internal_sensitivity";--> statement-breakpoint
ALTER TABLE "auth_assurance_challenges" ADD CONSTRAINT "auth_assurance_challenges_subject_id_auth_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."auth_subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_assurance_challenges" ADD CONSTRAINT "auth_assurance_challenges_session_id_auth_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."auth_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_mfa_backup_codes" ADD CONSTRAINT "auth_mfa_backup_codes_subject_id_auth_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."auth_subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_mfa_totp_factors" ADD CONSTRAINT "auth_mfa_totp_factors_subject_id_auth_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."auth_subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_assurance_challenges_subject_idx" ON "auth_assurance_challenges" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "auth_assurance_challenges_session_idx" ON "auth_assurance_challenges" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "auth_assurance_challenges_active_idx" ON "auth_assurance_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "auth_mfa_backup_codes_subject_idx" ON "auth_mfa_backup_codes" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "auth_mfa_backup_codes_batch_idx" ON "auth_mfa_backup_codes" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "auth_mfa_totp_factors_subject_idx" ON "auth_mfa_totp_factors" USING btree ("subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_mfa_totp_factors_active_subject_key" ON "auth_mfa_totp_factors" USING btree ("subject_id") WHERE "auth_mfa_totp_factors"."disabled_at" is null;
