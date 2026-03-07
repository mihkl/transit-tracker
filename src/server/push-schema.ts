import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const pushNotifications = sqliteTable(
  "push_notifications",
  {
    id: text("id").primaryKey(),
    endpoint: text("endpoint").notNull(),
    jobKey: text("job_key").notNull(),
    notifyAt: integer("notify_at", { mode: "number" }).notNull(),
    nextAttemptAt: integer("next_attempt_at", { mode: "number" }).notNull(),
    subscriptionJson: text("subscription_json").notNull(),
    payloadJson: text("payload_json").notNull(),
    status: text("status").notNull().default("pending"),
    attemptCount: integer("attempt_count", { mode: "number" }).notNull().default(0),
    claimedAt: integer("claimed_at", { mode: "number" }),
    sentAt: integer("sent_at", { mode: "number" }),
    lastError: text("last_error"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("push_notifications_endpoint_job_key_idx").on(
      table.endpoint,
      table.jobKey,
    ),
    index("push_notifications_due_idx").on(table.status, table.nextAttemptAt),
    index("push_notifications_endpoint_idx").on(table.endpoint),
  ],
);
