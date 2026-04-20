import { pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const appMetadata = pgTable("app_metadata", {
  key: varchar("key", { length: 128 }).primaryKey(),
  value: text("value").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
});
