import {
  boolean,
  index,
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

export const authAssuranceLevel = pgEnum("auth_assurance_level", ["basic"]);

export const authAccountEventType = pgEnum("auth_account_event_type", [
  "login_success",
  "login_failure",
  "logout",
  "session_revoked",
  "session_rotated",
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
