import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const authSubjectType = pgEnum("auth_subject_type", [
  "customer",
  "internal",
]);

export const authInternalSensitivity = pgEnum("auth_internal_sensitivity", [
  "none",
  "platform_admin",
  "tenant_owner",
  "branch_manager",
]);

export const authAssuranceLevel = pgEnum("auth_assurance_level", [
  "basic",
  "mfa_verified",
  "step_up_verified",
]);

export const authAssuranceChallengeReason = pgEnum("auth_assurance_challenge_reason", [
  "login_mfa",
  "mfa_enrollment",
  "tenant_context_switch",
  "support_grant_activation",
  "website_management_write",
  "data_export",
  "credential_reset",
]);

export const authAccountEventType = pgEnum("auth_account_event_type", [
  "login_success",
  "login_failure",
  "logout",
  "session_revoked",
  "session_rotated",
  "mfa_enrollment_started",
  "mfa_enrollment_completed",
  "mfa_challenge_created",
  "mfa_challenge_failed",
  "mfa_verified",
  "backup_code_used",
  "backup_codes_regenerated",
  "step_up_started",
  "step_up_verified",
  "assurance_denied",
]);

export const authSubjects = pgTable(
  "auth_subjects",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    subjectType: authSubjectType("subject_type").notNull(),
    loginIdentifier: varchar("login_identifier", { length: 255 }).notNull(),
    normalizedLoginIdentifier: varchar("normalized_login_identifier", {
      length: 255,
    }).notNull(),
    passwordHash: text("password_hash").notNull(),
    internalSensitivity: authInternalSensitivity("internal_sensitivity"),
    passwordUpdatedAt: timestamp("password_updated_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    isEnabled: boolean("is_enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    bySubjectTypeAndLogin: uniqueIndex("auth_subjects_subject_type_login_key").on(
      table.subjectType,
      table.normalizedLoginIdentifier,
    ),
    normalizedLoginIdx: index("auth_subjects_normalized_login_idx").on(
      table.normalizedLoginIdentifier,
    ),
  }),
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    subjectId: varchar("subject_id", { length: 64 })
      .notNull()
      .references(() => authSubjects.id, { onDelete: "cascade" }),
    subjectType: authSubjectType("subject_type").notNull(),
    secretHash: text("secret_hash").notNull(),
    assuranceLevel: authAssuranceLevel("assurance_level").notNull().default("basic"),
    assuranceUpdatedAt: timestamp("assurance_updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    activeTenantId: varchar("active_tenant_id", { length: 64 }),
    activeBranchId: varchar("active_branch_id", { length: 64 }),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastRotatedAt: timestamp("last_rotated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revocationReason: varchar("revocation_reason", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    subjectIdx: index("auth_sessions_subject_idx").on(table.subjectId),
    activeIdx: index("auth_sessions_active_idx").on(
      table.expiresAt,
      table.revokedAt,
    ),
  }),
);

export const authAssuranceChallenges = pgTable(
  "auth_assurance_challenges",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    subjectId: varchar("subject_id", { length: 64 })
      .notNull()
      .references(() => authSubjects.id, { onDelete: "cascade" }),
    sessionId: varchar("session_id", { length: 64 }).references(() => authSessions.id, {
      onDelete: "cascade",
    }),
    requiredAssurance: authAssuranceLevel("required_assurance").notNull(),
    reason: authAssuranceChallengeReason("reason").notNull(),
    secretHash: text("secret_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    invalidatedAt: timestamp("invalidated_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    subjectIdx: index("auth_assurance_challenges_subject_idx").on(table.subjectId),
    sessionIdx: index("auth_assurance_challenges_session_idx").on(table.sessionId),
    activeIdx: index("auth_assurance_challenges_active_idx").on(table.expiresAt),
  }),
);

export const authMfaTotpFactors = pgTable(
  "auth_mfa_totp_factors",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    subjectId: varchar("subject_id", { length: 64 })
      .notNull()
      .references(() => authSubjects.id, { onDelete: "cascade" }),
    encryptedSecret: text("encrypted_secret").notNull(),
    encryptionKeyVersion: varchar("encryption_key_version", { length: 32 }).notNull(),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    subjectIdx: index("auth_mfa_totp_factors_subject_idx").on(table.subjectId),
    activePerSubjectIdx: uniqueIndex("auth_mfa_totp_factors_active_subject_key")
      .on(table.subjectId)
      .where(sql`${table.disabledAt} is null`),
  }),
);

export const authMfaBackupCodes = pgTable(
  "auth_mfa_backup_codes",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    subjectId: varchar("subject_id", { length: 64 })
      .notNull()
      .references(() => authSubjects.id, { onDelete: "cascade" }),
    batchId: varchar("batch_id", { length: 64 }).notNull(),
    codeHash: text("code_hash").notNull(),
    ordinal: integer("ordinal").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (table) => ({
    subjectIdx: index("auth_mfa_backup_codes_subject_idx").on(table.subjectId),
    batchIdx: index("auth_mfa_backup_codes_batch_idx").on(table.batchId),
  }),
);

export const authAccountEvents = pgTable(
  "auth_account_events",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    subjectId: varchar("subject_id", { length: 64 }).references(() => authSubjects.id, {
      onDelete: "set null",
    }),
    sessionId: varchar("session_id", { length: 64 }).references(() => authSessions.id, {
      onDelete: "set null",
    }),
    subjectType: authSubjectType("subject_type").notNull(),
    eventType: authAccountEventType("event_type").notNull(),
    loginIdentifier: varchar("login_identifier", { length: 255 }),
    detail: text("detail"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    subjectEventIdx: index("auth_account_events_subject_idx").on(table.subjectId),
    sessionEventIdx: index("auth_account_events_session_idx").on(table.sessionId),
  }),
);
