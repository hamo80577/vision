CREATE TYPE "public"."auth_account_event_type" AS ENUM('login_success', 'login_failure', 'logout', 'session_revoked', 'session_rotated');--> statement-breakpoint
CREATE TYPE "public"."auth_assurance_level" AS ENUM('basic');--> statement-breakpoint
CREATE TYPE "public"."auth_subject_type" AS ENUM('customer', 'internal');--> statement-breakpoint
CREATE TABLE "auth_account_events" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"subject_id" varchar(64),
	"session_id" varchar(64),
	"subject_type" "auth_subject_type" NOT NULL,
	"event_type" "auth_account_event_type" NOT NULL,
	"login_identifier" varchar(255),
	"detail" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"subject_id" varchar(64) NOT NULL,
	"subject_type" "auth_subject_type" NOT NULL,
	"secret_hash" text NOT NULL,
	"assurance_level" "auth_assurance_level" DEFAULT 'basic' NOT NULL,
	"active_tenant_id" varchar(64),
	"active_branch_id" varchar(64),
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_rotated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revocation_reason" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_subjects" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"subject_type" "auth_subject_type" NOT NULL,
	"login_identifier" varchar(255) NOT NULL,
	"normalized_login_identifier" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"password_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_account_events" ADD CONSTRAINT "auth_account_events_subject_id_auth_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."auth_subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_account_events" ADD CONSTRAINT "auth_account_events_session_id_auth_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."auth_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_subject_id_auth_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."auth_subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_account_events_subject_idx" ON "auth_account_events" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "auth_account_events_session_idx" ON "auth_account_events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_subject_idx" ON "auth_sessions" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_active_idx" ON "auth_sessions" USING btree ("expires_at","revoked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_subjects_subject_type_login_key" ON "auth_subjects" USING btree ("subject_type","normalized_login_identifier");--> statement-breakpoint
CREATE INDEX "auth_subjects_normalized_login_idx" ON "auth_subjects" USING btree ("normalized_login_identifier");