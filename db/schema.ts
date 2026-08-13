import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const portfolioVisitSessions = sqliteTable(
  "portfolio_visit_sessions",
  {
    id: text("id").primaryKey(),
    deviceId: text("device_id").notNull(),
    startedAt: integer("started_at").notNull(),
    latestAt: integer("latest_at").notNull(),
    confirmedAt: integer("confirmed_at"),
  },
  (table) => [
    index("idx_portfolio_visit_device_started").on(table.deviceId, table.startedAt),
    index("idx_portfolio_visit_started").on(table.startedAt),
  ],
);
