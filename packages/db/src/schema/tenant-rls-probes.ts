import { index, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

export const tenantRlsProbes = pgTable(
  "tenant_rls_probes",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 64 }).notNull(),
    probeKey: varchar("probe_key", { length: 128 }).notNull(),
    probeValue: text("probe_value").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index("tenant_rls_probes_tenant_idx").on(table.tenantId),
    tenantKeyIdx: uniqueIndex("tenant_rls_probes_tenant_key_key").on(
      table.tenantId,
      table.probeKey,
    ),
  }),
);
